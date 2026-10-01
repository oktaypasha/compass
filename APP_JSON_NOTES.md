app.json — iOS sürüm kimliği + Apple anahtarları + 50 Hz sensör izni.

**Yapılanlar:**
- `ios.bundleIdentifier: com.pusula.compass` (olmadan `expo run:ios` / EAS build çalışmaz)
- `ios.buildNumber: "1"` ve `ios.icon` (TestFlight/App Store için zorunlu)
- `ios.infoPlist.NSMotionUsageDescription` — CoreMotion cihaz hareketi; iOS 17+ magnetometre
  erişimi de `NSMotionAndMagneticFieldUsageDescription` ister. Anahtarsız iOS derlemesi
  çalışmaz / crash verir.
- `android.versionCode: 1` + `versionName: "1.0.0"` — her release build'de artmalı, yoksa
  ikinci yükleme "daha yeni sürüm kurulu" hatası verir.
- `runtimeVersion` — EAS Update (OTA) uyumluluğu için JS sürüm anahtarı.
- `android.permissions`: `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` (ters kodlama ve
  hassas WMM sapması için) + `HIGH_SAMPLING_RATE_SENSORS`.
  ⚠️ Sonuncusu kritik: Android 12+ hedefleyen uygulamalar 20 ms (50 Hz) sensör isteğini bu
  izin olmadan 200 ms'e (5 Hz) kırpar. Bu cihaz Android 9 olduğu için şu an etkilenmiyor,
  ama yeni cihazlarda kadran yavaşlayıp "tepki vermiyor" gibi görünür.
- `splash` — var olan `assets/splash-icon.png` daha önce referanssızdı.
- `android.predictiveBackGestureEnabled: false` korundu (pusula geri hareketi tuhaf durur).
- `supportsTablet` ve `orientation: portrait` korundu.
