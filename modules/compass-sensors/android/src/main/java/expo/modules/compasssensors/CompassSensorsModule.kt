package expo.modules.compasssensors

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.hypot

/**
 * System rotation-vector heading.
 *
 * Prefers Sensor.TYPE_ROTATION_VECTOR (accelerometer + magnetometer + gyroscope
 * fused by the OS, tilt-compensated, no manual gyro integration needed) and falls
 * back to Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR (accelerometer + magnetometer).
 * The azimuth is remapped for portrait so headingDeg is a clockwise compass
 * bearing: 0 = magnetic north, 90 = east.
 *
 * Apple: not implemented (project has no iOS device); add an iOS module backed by
 * CMMotionManager.deviceMotion.attitude.quaternion when an Apple device exists.
 */
class CompassSensorsModule : Module() {
  private var sensorManager: SensorManager? = null
  private var listener: SensorEventListener? = null
  private var activeType: Int = Sensor.TYPE_ROTATION_VECTOR

  /** Üst kenar yatay izdüşümü bu kadar belirginse saf tilt-kompanzasyon kullan. */
  private val topEdgeTrust = 0.25

  /** Üst kenar yatay izdüşümü bu kadar küçükse saf bakış yönüne geç. */
  private val topEdgeDead = 0.02

  private fun manager(): SensorManager {
    sensorManager?.let { return it }
    val ctx = appContext.reactContext
      ?: throw IllegalStateException("CompassSensorsModule: no react context")
    val mgr = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    sensorManager = mgr
    return mgr
  }

  private fun stopLocked() {
    val mgr = sensorManager ?: return
    listener?.let {
      try { mgr.unregisterListener(it) } catch (_: Exception) { /* already gone */ }
      listener = null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CompassSensorsModule")

    Events("onRotationVector", "onSensorAccuracy")

    /**
     * Cihazın GERÇEKTE hangi sensörleri olduğunu bildirir.
     *
     * Neden bu kadar ayrıntılı: "sensör yok" mesajı bir yargı değil, bir varsayımdı
     * ve yanlış çıktı. Samsung Galaxy J7 Prime 2 (SM-G611F) gibi telefonlarda
     * ivmeölçer VAR, manyetometre YOK; jiroskop de yok. Bu telefonlarda dönüş
     * vektörü ve dolayısıyla pusula imkânsızdır — ama ivmeölçer sayesinde su
     * terazisi ve eğim çalışır. Uygulama hangi eksik olduğunu bilmeli ki
     * kullanıcıya "bu telefonun pusulası yok" deyip Kalanı çalıştırsın.
     *
     * `canComputeHeading` tek başına yeterli değildir: native modül yoksa
     * `expo-sensors` yedeği devreye girer, o da manyetometre ister. Bu yüzden
     * JS tarafı hem bu bayrağı hem de manyetometre varlığını ayrı ayrı okur.
     */
    Function("getSensorCapabilities") {
      val mgr = manager()
      val has = { type: Int -> mgr.getDefaultSensor(type) != null }
      val hasMag = has(Sensor.TYPE_MAGNETIC_FIELD) || has(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED)
      val hasAccel = has(Sensor.TYPE_ACCELEROMETER) || has(Sensor.TYPE_ACCELEROMETER_UNCALIBRATED)
      val hasGyro = has(Sensor.TYPE_GYROSCOPE)
      val hasRotVec = has(Sensor.TYPE_ROTATION_VECTOR)
      val hasGeomagRotVec = has(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
      mapOf(
        "magnetometer" to hasMag,
        "accelerometer" to hasAccel,
        "gyroscope" to hasGyro,
        "rotationVector" to hasRotVec,
        "geomagneticRotationVector" to hasGeomagRotVec,
        // Kerteriz için SONUNDA manyetik alan şart: ivmeölçer + jiroskop tek
        // başına yön vermez (manyetometre olmadan kuzey tanımsızdır).
        "canComputeHeading" to (hasMag && (hasRotVec || hasGeomagRotVec || hasAccel)),
        "sensorName" to (mgr.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.name ?: ""),
        "vendor" to (mgr.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.vendor ?: ""),
      )
    }

    Function("isRotationVectorAvailable") {
      val mgr = manager()
      mgr.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null ||
        mgr.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) != null
    }

    Function("getFieldModel") { latDeg: Double, lonDeg: Double, altMeters: Double ->
      // WMM model baked into the OS; current epoch from system clock.
      val field = GeomagneticField(
        latDeg.toFloat(), lonDeg.toFloat(), altMeters.toFloat(), System.currentTimeMillis(),
      )
      mapOf(
        "declinationDeg" to field.declination.toDouble(),
        "inclinationDeg" to field.inclination.toDouble(),
        "strengthMicroTesla" to field.fieldStrength.toDouble(),
      )
    }

    Function("startRotationVector") { intervalMs: Int ->
      stopLocked()
      val mgr = manager()
      val sensor = mgr.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        ?: mgr.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
        ?: throw IllegalStateException("No rotation-vector sensor on this device")
      activeType = sensor.type
      val source = if (activeType == Sensor.TYPE_ROTATION_VECTOR) "rotation" else "geomagnetic"
      val rot = FloatArray(9)
      // Poz KÖRÜ, SÜREKLİ kerteriz harmanı (TS ikizi: headingFromRotationMatrix).
      //
      // R (row-major) cihazı dünya çerçevesine taşır; dünya X=doğu, Y=manyetik
      // kuzey, Z=yukarı. Cihaz eksenleri R'nin SÜTUNLARIDIR:
      //   üst kenar     = sütun 1 = (R[1],R[4],R[7])
      //   ekran normali = sütun 2 = (R[2],R[5],R[8])
      // İki yatay referans vektörü, iki FARKLI tutuş sözleşmesidir:
      //   f = üst kenarın yatay izdüşümü    → telefon DÜZken doğru (tilt-kompanzasyon)
      //   g = −ekran normalinin yatay izdüşümü → telefon DİKken anlamlı (bakış)
      // v2 bunları |R[8]| 0.4/0.6 eşiğiyle ANALTIRDI; 30–70° eğim bandında iki
      // tanım 90° ayrıldığı için bilek hareketi kadranı alakasız yere atıyordu
      // ("telefonu döndürünce yanlış yerde duruyor" şikâyetinin kökü).
      // v3'te el değişimi |f|'in güvenilirliğine bağlı ve DAR: 0–75° eğimde okuma
      // birebir düz (tilt-kompanzasyonlu) kerterizdir, el değişimi yalnızca üst
      // kenarın yatay izdüşümü çöktüğünde (telefon neredeyse dikey) başlar.
      // Geniş bant denendi ve REDDEDİLDİ: üst kenar tam kuzeydeyken iki sözleşme
      // antiparalel olup harman vektörü sıfırdan geçiyor, 180° sıçrama yapıyordu
      // (ölçüm: yaw=0, 46° eğim). `lastPose` yalnızca arayüz ipucudur.
      var lastPose = "flat"
      val l = object : SensorEventListener {
        override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {
          sendEvent("onSensorAccuracy", mapOf("accuracy" to accuracy, "source" to source))
        }

        override fun onSensorChanged(event: SensorEvent) {
          SensorManager.getRotationMatrixFromVector(rot, event.values)
          val sz = rot[8]
          val a = abs(sz)
          if (lastPose == "upright") lastPose = if (a > 0.6f) "flat" else "upright"
          else lastPose = if (a < 0.4f) "upright" else "flat"
          val fx = rot[1].toDouble()
          val fy = rot[4].toDouble()
          val gx = -rot[2].toDouble()
          val gy = -rot[5].toDouble()
          val mf = hypot(fx, fy)
          var k = ((mf - topEdgeDead) / (topEdgeTrust - topEdgeDead)).toDouble()
          if (k < 0.0) k = 0.0
          if (k > 1.0) k = 1.0
          k = k * k * (3.0 - 2.0 * k)
          var vx = k * fx + (1 - k) * gx
          var vy = k * fy + (1 - k) * gy
          if (vx * vx + vy * vy < 1e-12) {
            if (mf > 0.0) { vx = fx; vy = fy } else { vx = gx; vy = gy }
          }
          var heading = Math.toDegrees(atan2(vx, vy))
          if (heading < 0) heading += 360.0
          if (heading < 0) heading += 360.0
          // Yalnizca JS'in gercekten okudugu alanlar gonderilir: 50 Hz'de her
          // tick'te quaternion serializasyonu gereksiz bridge trafigiydi.
          sendEvent(
            "onRotationVector",
            mapOf(
              "headingDeg" to heading,
              "pose" to lastPose,
              "source" to source,
            ),
          )
        }
      }
      listener = l
      val periodUs = (intervalMs.coerceIn(10, 200)) * 1000
      mgr.registerListener(l, sensor, periodUs)
    }

    Function("stopRotationVector") {
      stopLocked()
    }

    OnDestroy {
      stopLocked()
      sensorManager = null
    }
  }
}
