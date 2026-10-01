import { requireNativeModule } from 'expo-modules-core';

export type RotationSource = 'rotation' | 'geomagnetic';

export interface RotationVectorEvent {
  /**
   * Clockwise compass bearing, 0 = magnetic north, 90 = east.
   *
   * Android: native rotation-vector'dan doğrudan gelir.
   * iOS: **gönderilmez.** iOS yalnızca ham vektörleri (`gravity`/`mag`) iletir ve
   * kerteriz `headingFromRawVectors()` ile JS tarafında hesaplanır; böylece iki
   * platform aynı, test edilmiş matematiği kullanır.
   *
   * Opsiyoneldir: JS tarafı eksik alanı `NaN`/sentinel saymaz, örneği yok sayıp
   * bir sonrakini bekler (sessizce 0'a düşmez).
   */
  headingDeg?: number;
  /** Grip pose for the bearing: flat (top edge) or upright (gaze). */
  pose: 'flat' | 'upright';
  /**
   * Which sensor produced the sample: Android `rotation` / `geomagnetic`,
   * iOS `motion`. Kept for diagnostics — the JS layer does not branch on it,
   * but the status card and logcat can.
   */
  source: RotationSource | 'motion';
  /** iOS only: CLHeading-style magnetic field accuracy, 0 = unreliable. */
  magAccuracy?: number;
  /**
   * iOS only: raw device-frame vectors (x = right, y = top, z = out of screen).
   * `gravity` points DOWN, `mag` points at magnetic north. When present the JS
   * layer computes the bearing itself via `headingFromRawVectors`.
   */
  gravity?: { x: number; y: number; z: number };
  mag?: { x: number; y: number; z: number };
}

export interface SensorAccuracyEvent {
  /** 0 = unreliable, 1 = low, 2 = medium, 3 = high. */
  accuracy: number;
  source: RotationSource | 'motion';
}

export interface FieldModel {
  /**
   * East-positive degrees: true = magnetic + declination.
   * `null` when the platform has no on-device WMM model (iOS) — the caller must
   * fall back to its cached or manually entered value rather than invent one.
   */
  declinationDeg: number | null;
  inclinationDeg?: number;
  strengthMicroTesla?: number;
}

/**
 * Cihazın GERÇEKTE hangi sensörleri olduğu.
 *
 * Neden ayrı bir tip ve neden bu kadar ayrıntılı: "sensör yok" mesajı tek bir
 * boolean olursa uygulama hangi sensörün eksik olduğunu bilemez ve kullanıcıya
 * yanlış şey söyler. Örnek: Samsung Galaxy J7 Prime 2 (SM-G611F) — ivmeölçer
 * VAR, manyetometre ve jiroskop YOK. Bu telefonlarda pusula imkânsız ama su
 * terazisi ve eğim çalışır. Kullanıcı "sensör yok" deyip uygulamayı silmek
 * yerine "bu telefonun pusula donanımı yok, uygulama doğru çalışıyor" demeli.
 */
export interface SensorCapabilities {
  /** Manyetometre (dijital pusula) — kerteriz için zorunlu. */
  magnetometer: boolean;
  /** İvmeölçer — su terazisi, eğim ve tilt-kompanzasyon için gerekli. */
  accelerometer: boolean;
  gyroscope: boolean;
  /** OS füzyonlu dönüş vektörü (jiro + ivme + manyetik). */
  rotationVector: boolean;
  /** Jiroskopsuz füzyon (ivme + manyetik). */
  geomagneticRotationVector: boolean;
  /** Kerteriz HESAPLANABİLİR mi: manyetik alan + (füzyon ya da ivmeölçer). */
  canComputeHeading: boolean;
  /** Android'de manyetometre sürücüsünün adı (tanı sorunu için boş olabilir). */
  sensorName?: string;
  vendor?: string;
}

interface NativeEmitter {
  addListener(
    eventName: 'onRotationVector',
    listener: (e: RotationVectorEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onSensorAccuracy',
    listener: (e: SensorAccuracyEvent) => void,
  ): { remove(): void };
}

interface NativeModuleShape extends NativeEmitter {
  isRotationVectorAvailable(): boolean;
  getSensorCapabilities(): SensorCapabilities;
  getFieldModel(latDeg: number, lonDeg: number, altMeters: number): FieldModel | null;
  startRotationVector(intervalMs: number): void;
  stopRotationVector(): void;
}

let cached: NativeModuleShape | null | undefined;

function native(): NativeModuleShape | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeModuleShape>('CompassSensorsModule');
  } catch {
    // Expo Go or any client without the local module: caller falls back to JS fusion.
    cached = null;
  }
  return cached;
}

/** False on Expo Go / web. True on Android and iOS once the module is linked. */
export function isNativeModulePresent(): boolean {
  return native() !== null;
}

export function isRotationVectorAvailable(): boolean {
  const mod = native();
  if (!mod) return false;
  try {
    return mod.isRotationVectorAvailable();
  } catch {
    return false;
  }
}

export function getFieldModel(latDeg: number, lonDeg: number, altMeters: number): FieldModel | null {
  const mod = native();
  if (!mod) return null;
  try {
    return mod.getFieldModel(latDeg, lonDeg, altMeters);
  } catch {
    return null;
  }
}

/**
 * Cihaz sensör yetenekleri.
 *
 * Native modül yoksa (Expo Go, web) `null` döner; çağıran bunu "bilmiyorum"
 * olarak ayırt etmeli — "pusula yok" DIYE yorumlamamalı. Çünkü Expo Go'da
 * modül yoktur ama telefonun manyetometresi sağlamdır; `expo-sensors` yedeği
 * çalışır. Yanlış "sensör yok" mesajı göstermek, çalışan bir uygulamayı
 * bozuk ilan etmekten daha kötüdür.
 */
export function getSensorCapabilities(): SensorCapabilities | null {
  const mod = native();
  if (!mod) return null;
  try {
    return mod.getSensorCapabilities();
  } catch {
    return null;
  }
}

export interface RotationSubscription {
  remove(): void;
}

export function subscribeRotationVector(
  intervalMs: number,
  onEvent: (e: RotationVectorEvent) => void,
  onAccuracy?: (e: SensorAccuracyEvent) => void,
): RotationSubscription | null {
  const mod = native();
  if (!mod) return null;
  // SDK 52+: native modülün kendisi zaten bir EventEmitter'dır.
  const subs = [mod.addListener('onRotationVector', onEvent)];
  if (onAccuracy) subs.push(mod.addListener('onSensorAccuracy', onAccuracy));
  try {
    mod.startRotationVector(intervalMs);
  } catch {
    subs.forEach((s) => s.remove());
    return null;
  }
  return {
    remove() {
      subs.forEach((s) => s.remove());
      try {
        mod.stopRotationVector();
      } catch {
        // Tearing down; nothing to report.
      }
    },
  };
}
