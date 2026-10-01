import CoreMotion
import ExpoModulesCore

/**
 * CompassSensorsModule — Apple (iOS) implementation.
 *
 * ⚠️ Bu dosya KERTERİZ HESAPLAMAZ. Yalnızca iki ham vektörü iletir:
 *
 *   gravity        = CMMotionManager cihaz koordinatları (x=sağ, y=üst, z=ekran dışı)
 *   magneticField  = aynı koordinat sisteminde, manyetik KUZEYE doğru
 *
 * Neden: Daha önce bu dosya `CMAttitude` quaternion'ından bir dönüş matrisi
 * kurup `atan2` ile kerterizi kendisi hesaplıyordu. Apple'ın attitude sözleşmesi
 * (rotasyonun satır mı sütun mu olduğu, referans çerçevenin el yönü) belgelerde
 * net yazılı değil ve bu belirsizlik CANLIDA YANLIŞ YÖNE yol açtı: telefon
 * ekseninde döndükçe kadran dönüyor, sonra YANLIŞ bir yönde duruyordu. Üstelik
 * bu yol hiçbir birim testinden geçmiyordu.
 *
 * Ham vektörlerden 3B eğim-kompanzasyonlu kerterizi `src/utils/heading.ts`
 * içindeki `headingFromRawVectors()` üretir — Android ile AYNI, test edilmiş
 * fonksiyon. Böylece iki platformun matematiği tek yerden gelir ve iOS'ta
 * çerçeve varsayımı diye bir şey kalmaz.
 *
 * Referans çerçeve `xMagneticNorthZVertical` yalnızca `attitude`/hareket
 * füzyonu için istenir; kerteriz için kullanılmaz.
 */
public class CompassSensorsModule: Module {
  private let motion = CMMotionManager()
  private var running = false
  private var upright = false
  private var lastAccuracy: CLHeadingAccuracy = .unavailable

  /// Accuracy mirroring the Android 0–3 scale.
  private func accuracyCode(_ a: CLHeadingAccuracy) -> Int {
    switch a {
    case .best: return 3
    case .good: return 2
    case .poor: return 1
    default: return 0
    }
  }

  private func poseLabel(sz: Double) -> String {
    let a = abs(sz)
    if upright { return a > 0.6 ? "flat" : "upright" }
    return a < 0.4 ? "upright" : "flat"
  }

  public func definition() -> ModuleDefinition {
    Name("CompassSensorsModule")

    Events("onRotationVector", "onSensorAccuracy")

    /**
     * Cihazın sensör yetenekleri — Android ile aynı sözleşme.
     *
     * `magnetometer`, `compass.available` üzerinden raporlanır: Apple'da
     * `CMMotionManager.isMagnetometerAvailable` iOS 12+'da vardır ve manyetik
     * alanı gerçekten ölçebiliyorsa true döner. iPhone'da bu pratikte her
     * zaman true'dur; yine de sorgu, iki platformun tek bir yetenek modelini
     * paylaşmasını sağlar ve gelecekteki donanım farkları için doğru yerdir.
     */
    Function("getSensorCapabilities") { () -> [String: Any] in
      let hasMagnetometer = self.motion.isMagnetometerAvailable
      let hasAccelerometer = self.motion.isAccelerometerAvailable
      let hasDeviceMotion = self.motion.isDeviceMotionAvailable
      return [
        "magnetometer": hasMagnetometer,
        "accelerometer": hasAccelerometer,
        "gyroscope": self.motion.isGyroAvailable,
        // Apple'da "rotation vector" karşılığı fused device motion'dır; ham
        // rotation-vector sensörü diye bir şey yoktur.
        "rotationVector": hasDeviceMotion,
        "geomagneticRotationVector": false,
        "canComputeHeading": hasMagnetometer && hasDeviceMotion,
        "sensorName": "",
        "vendor": "Apple",
      ]
    }

    Function("isRotationVectorAvailable") { () -> Bool in
      self.motion.isDeviceMotionAvailable
    }

    // Apple exposes no on-device WMM model, so declination is unavailable here.
    // The app falls back to a cached value (computed on Android) or the manual
    // entry in Settings; inventing a value would be worse than none.
    Function("getFieldModel") { (_ latDeg: Double, _ lonDeg: Double, _ altMeters: Double) -> [String: Any]? in
      nil
    }

    Function("startRotationVector") { (intervalMs: Int) -> Void in
      self.stopLocked()
      guard self.motion.isDeviceMotionAvailable else {
        throw Exception(
          "CompassSensorsModule: device motion is not available on this device"
        )
      }
      self.running = true
      self.upright = false
      let seconds = Double(max(10, min(200, intervalMs))) / 1000.0
      // CoreMotion delivers on its own queue at up to the requested interval;
      // `deviceMotion` is already tilt-compensated, so no manual gyro fusion.
      self.motion.deviceMotionUpdateInterval = seconds
      self.motion.startDeviceMotionUpdates(
        using: .xMagneticNorthZVertical,
        to: OperationQueue.main
      ) { [weak self] motion, error in
        guard let self, self.running else { return }
        if let error {
          // A transient failure must not kill the stream: report low accuracy
          // and let the JS source chain decide.
          self.sendEvent("onSensorAccuracy", ["accuracy": 0, "source": "motion"])
          NSLog("CompassSensorsModule: device motion error \(error.localizedDescription)")
          return
        }
        guard let motion else { return }

        // Yalnızca ham vektörler. KERTERİZ JS'TE HESAPLANIR.
        let g = motion.gravity
        let mf = motion.magneticField
        let m = mf.field
        let sz = abs(g.z)

        if !self.upright && sz < 0.4 { self.upright = true }
        else if self.upright && sz > 0.6 { self.upright = false }

        self.sendEvent(
          "onRotationVector",
          [
            // `headingDeg` BİLEREK GÖNDERİLMEZ: iOS'ta skaler kerteriz yok,
            // kerteriz JS'teki `headingFromRawVectors()` ile hesaplanır. NaN gibi
            // bir sentinele ihtiyaç yok — event köprüsü NaN'ı JSON'a çevirmeye
            // çalışıp hata verebilirdi. Eksik alan JS'te "bu örnek kullanılamaz"
            // anlamına gelir ve örnek ATILIR (sessizce 0° gösterilmez).
            "gravityX": g.x, "gravityY": g.y, "gravityZ": g.z,
            "magX": m.x, "magY": m.y, "magZ": m.z,
            "pose": self.poseLabel(sz: sz),
            "source": "motion",
            "magAccuracy": mf.accuracy.rawValue,
          ]
        )
      }
    }

    Function("stopRotationVector") {
      stopLocked()
    }

    OnDestroy {
      stopLocked()
    }
  }

  private func stopLocked() {
    running = false
    if motion.isDeviceMotionActive {
      motion.stopDeviceMotionUpdates()
    }
  }
}
