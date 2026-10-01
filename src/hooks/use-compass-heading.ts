import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  getSensorCapabilities,
  isNativeModulePresent,
  isRotationVectorAvailable,
  subscribeRotationVector,
  type RotationSubscription,
  type SensorAccuracyEvent,
  type SensorCapabilities,
} from '../../modules/compass-sensors/src';
import { compassMotion } from '../theme';
import {
  applyDeclination,
  applyUserOffset,
  bearingFromSample,
  cardinalIndex,
  classifyFieldStrength,
  clampUserOffset,
  complementaryStep,
  createEmaState,
  crossedNorth,
  emaAngleRead,
  emaAngleStep,
  isDeviceLevel,
  levelFromAccel,
  normalizeAngle,
  shortestDelta,
  tiltCompensatedHeading,
  unwrapStep,
  type DevicePose,
  type EmaState,
  type FieldQuality,
  type LevelReading,
} from '../utils/heading';

export type NorthReference = 'magnetic' | 'true';
export type HeadingSource = 'system' | 'manual' | 'simulated';

/**
 * Cihazın pusula donanımı durumu.
 *
 * - `ready`     → manyetometre var, kerteriz hesaplanabilir.
 * - `no-magnetometer` → manyetometre YOK. Kerteriz FİZİKSEL olarak imkânsız
 *   (kuzey tanımsız); ivmeölçer varsa su terazisi çalışmaya devam eder.
 * - `unknown`   → native modül yok (Expo Go/web) veya sorgu başarısız. Bu
 *   "sensör yok" DEĞİLDİR: yedeğe düşülür, sonuç gelirse `ready`'ye geçilir.
 */
export type CompassHardware = 'ready' | 'no-magnetometer' | 'unknown';

/**
 * Android jiroskop işareti: +z ekseni, ekrana bakan gözle SAAT YÖNÜNÜN TERSİNE
 * pozitif döner (sağ-el kuralı). Pusula kerterizi saat yönünde artar →
 * jiro katkısı NEGATİF olmalı. (Yalnızca manuel yedek yolda kullanılır.)
 */
const GYRO_SIGN = -1;
/** Jiro bias takibi (yavaş EMA β): dururken süzülen ofseti sıfırlar. */
const GYRO_BIAS_BETA = 0.002;

/** Sessiz sensör eşiği: bu süre boyunca veri gelmezse bir sonraki kaynağa geç. */
const SENSOR_TIMEOUT_MS = 2500;

/** Kalıcı kalibrasyon anahtarları (AsyncStorage). */
const OFFSET_STORAGE_KEY = 'compass.userOffsetDeg.v1';
const MANUAL_DECL_STORAGE_KEY = 'compass.manualDeclinationDeg.v1';
/** Elle sapma girişinin sınırları (derece) — Türkiye ≈ +4…+7°D. */
export const MANUAL_DECLINATION_LIMIT_DEG = 30;

export interface CompassState {
  /** UI-thread animasyon değeri: sarmalanmamış sürekli açı (derece, sınırsız birikir). */
  headingSV: SharedValue<number>;
  /** Metin gösterimi için kısılmış değer (5 Hz). İlk sensör örneğinden ÖNCE null. */
  headingDeg: number | null;
  /** İlk gerçek örnek geldi mi? false iken UI uydurma yön göstermez. */
  ready: boolean;
  cardinalIdx: number;
  /** Manyetik alan şiddeti (µT) — parazit göstergesi. */
  fieldStrength: number;
  fieldQuality: FieldQuality;
  /** Native sensör doğruluğu (0–3); manuel yolda null. */
  sensorAccuracy: number | null;
  /** Tutuş pozu (system yolunda native'den); yalnızca arayüz ipucu. */
  pose: DevicePose | null;
  level: boolean;
  bubble: LevelReading;
  /** Demo modu açıkken `true` — kerteriz UYDURMA, ölçüm değildir. */
  simulated: boolean;
  available: boolean;
  /** Cihazın pusula donanımı gerçekte var mı — 'unknown' "bilmiyorum" demektir. */
  hardware: CompassHardware;
  /** Cihazın sensör yetenekleri (native modül yoksa null). */
  capabilities: SensorCapabilities | null;
  /** Aktif yön kaynağı: system (OS rotation-vector) / manual (JS füzyon) / simulated. */
  source: HeadingSource;
  reference: NorthReference;
  setReference: (r: NorthReference) => void;
  /**
   * Uygulanan WMM sapması (doğu-pozitif derece) veya null. Konumun tek sahibi
   * `useLocationInfo`'dur; buraya yalnızca hesaplanan değer beslenir.
   */
  declinationDeg: number | null;
  /** Sapmayı dışarıdan besler. null → manyetik kuzey. */
  setDeclinationDeg: (deg: number | null) => void;
  /**
   * DEMO modu — sahte kerteriz. **Varsayılan KAPALI.**
   *
   * Neden bu kadar korunuyor: uydurma bir kerteriz, gerçekmiş gibi gösterildiğinde
   * pusula uygulamasının en kötü hatadır — kullanıcı yanlış yöne gider. Bu
   * yüzden otomatik fallback olarak kullanıldığında (eski davranış) uygulama
   * manyetometresi olmayan telefonlarda bozuk görünüyor ve kullanıcı siliyordu.
   * Şimdi yalnızca ayarlardan AÇIKÇA açılabiliyor ve ekranda "DEMO" olarak
   * etiketleniyor; ölçüm iddiası taşımaz.
   */
  demoMode: boolean;
  setDemoMode: (on: boolean) => void;
  /** Cihazın hard-iron bias düzeltmesi (derece, ±20) — kalıcı. */
  offsetDeg: number;
  setOffsetDeg: (deg: number) => void;
  /** Elle girilen sapma (derece, ±30) — konum yoksa Gerçek kuzey için. */
  manualDeclinationDeg: number;
  setManualDeclinationDeg: (deg: number) => void;
}

/**
 * Kaynak zinciri: system rotation-vector → manuel JS füzyonu → simülasyon.
 *
 * - System yolu: OS tilt-kompanzasyonlu, jiro-füzyonlu kerteriz verir; JS tarafı
 *   yalnızca EMA + ölü bant + unwrap + UI-thread yazımı yapar (complementary YOK).
 * - Manuel yol: ivmeölçer+manyetometre tilt-kompanzasyonu + complementary + EMA.
 * - Her iki yol da aynı SV hattını besler; sapma EMA'dan ÖNCE uygulanır, mod
 *   değişimindeki sıçrama unwrap ile yumuşar.
 * - Simülasyon KALICI DEĞİLDİR: tırmanma döngüsü her 2.5 sn'de native sensörü
 *   yeniden dener, geri gelince sahte değerler durur.
 * - Kuzey geçişinde (unwrapped 360 katı) hafif haptic; kardinalde selection haptic.
 */
export function useCompassHeading(): CompassState {
  const headingSV = useSharedValue(0);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [cardinalIdx, setCardinalIdx] = useState(0);
  const [fieldStrength, setFieldStrength] = useState(0);
  const [fieldQuality, setFieldQuality] = useState<FieldQuality>('normal');
  const [sensorAccuracy, setSensorAccuracy] = useState<number | null>(null);
  const [pose, setPose] = useState<DevicePose | null>(null);
  const [level, setLevel] = useState(true);
  const [bubble, setBubble] = useState<LevelReading>({
    pitchDeg: 0,
    rollDeg: 0,
    bubbleX: 0,
    bubbleY: 0,
  });
  const [simulated, setSimulated] = useState(false);
  // Manyetometre yoksa uygulama zaten ölçemez: "available" baştan false'tur.
  const [available, setAvailable] = useState(() => capabilities?.magnetometer !== false);
  /**
   * Sensör yetenekleri ve donanım durumu — ilk render'da SENKRON okunur.
   *
   * ⚠️ Neden `useEffect` DEĞİL: `getSensorCapabilities()` senkron bir native
   * sorgusudur (JS çağrısı, promise yok). Effect içinde `setState` çağırmak
   * "cascading render" lint hatası veriyor ve ilk karede yanlış UI boyardı:
   * ekran bir kez "pusula var" diye çizilip sonra "yok"a dönerdi. Senkron
   * okuma hem lint'i hem o titremeyi ortadan kaldırır.
   */
  /**
   * Manyetometre varlığı — İKİ KAYNAKTAN doğrulanır.
   *
   * ⚠️ Canlı hata (Expo Go): native modül Expo Go'da YOKTUR, bu yüzden
   * `getSensorCapabilities()` null döner ve `hardware` 'unknown' olarak
   * kalıyordu. Sonuç: manyetometresi olmayan telefonda ekranda ne "bu cihazda
   * pusula yok" açıklaması ne de dürüst bir uyarı vardı — sadece uydurma
   * "0 µT" ve "Uygulama füzyonu" yazıyordu. Kullanıcı bunun ne olduğunu
   * anlayamıyordu.
   *
   * Çözüm: `expo-sensors` da aynı soruyu sorabilir (`Magnetometer.isAvailableAsync`)
   * ve Expo Go'da ÇALIŞIR. İkisi birleşince:
   *   - native var → kesin donanım cevabı
   *   - native yok → expo-sensors'a düş (Expo Go)
   *   - ikisi de bilmiyorsa → 'unknown' (dürüst belirsizlik)
   */
  const [capabilities] = useState<SensorCapabilities | null>(() => getSensorCapabilities());
  const [magnetometerAvailable, setMagnetometerAvailable] = useState<boolean | null>(() =>
    capabilities ? capabilities.magnetometer : null,
  );
  const [hardware, setHardware] = useState<CompassHardware>(() =>
    capabilities && !capabilities.magnetometer ? 'no-magnetometer' : capabilities ? 'ready' : 'unknown',
  );

  // Native modül yoksa (Expo Go) expo-sensors'a sor. Bu effect TEK SEFER çalışır
  // ve yalnızca uygun zamanda `setState` çağırır (async callback), bu yüzden
  // `react-hooks/set-state-in-effect` kuralı ihlal edilmez.
  useEffect(() => {
    if (capabilities) return; // native cevapladı, tekrar sormaya gerek yok
    let alive = true;
    void (async () => {
      try {
        const ok = await Magnetometer.isAvailableAsync();
        if (!alive) return;
        setMagnetometerAvailable(ok);
        setHardware(ok ? 'ready' : 'no-magnetometer');
      } catch {
        // Sorgulanamadı: 'unknown' doğru yanıt — "bilmiyorum" demek.
        if (!alive) return;
        setMagnetometerAvailable(null);
        setHardware('unknown');
      }
    })();
    return () => {
      alive = false;
    };
  }, [capabilities]);
  // İlk kaynak senkron hesaplanır (effect içinde setState yok — lint kuralı).
  const [source, setSource] = useState<HeadingSource>(() =>
    isNativeModulePresent() && isRotationVectorAvailable() ? 'system' : 'manual',
  );
  const [reference, setReferenceState] = useState<NorthReference>('magnetic');
  const [declinationDeg, setDeclinationDegState] = useState<number | null>(null);

  const st = useRef({
    ema: createEmaState() as EmaState,
    fused: 0,
    unwrapped: 0,
    lastT: 0,
    lastGyroZ: 0,
    gyroBias: 0,
    lastAccel: { x: 0, y: 0, z: 9.81 },
    lastShownDeg: -1,
    lastShownT: 0,
    lastCardinal: -1,
    fieldQuality: 'normal' as FieldQuality,
    lastPose: null as DevicePose | null,
    gotHeading: false,
    /** İlk gerçek örnek işlendi mi (uydurma kuzeyi bastırmak için). */
    hasFirst: false,
    /** Füzyon hazır mı (complementary öngörü için). */
    ready: false,
    /** Manuel dinleyiciler zaten bağlı mı — yinelenen abonelikleri önler. */
    manualActive: false,
    reference: 'magnetic' as NorthReference,
    declination: null as number | null,
    /** Cihaz manyetik ofseti (derece) — kullanıcı düzeltmesi. */
    offset: 0,
    /** Elle girilen sapma (derece). */
    manualDeclination: 0,
  });

  const [offsetDeg, setOffsetDegState] = useState(0);
  const [manualDeclinationDeg, setManualDeclinationDegState] = useState(0);
  const [demoMode, setDemoModeState] = useState(false);

  /** Elle girilen sapma (±30°). Konum yokken Gerçek kuzeyi çalıştırır. */

  /** Cihaz manyetik ofseti: kalıcı, ±20° sınırlı. Ayarlar ekranından gelir. */
  const setOffsetDeg = useCallback((next: number) => {
    const v = clampUserOffset(next);
    st.current.offset = v;
    setOffsetDegState(v);
    void AsyncStorage.setItem(OFFSET_STORAGE_KEY, String(v)).catch(() => undefined);
  }, []);

  /** Elle girilen sapma (±30°). Konum yokken Gerçek kuzeyi çalıştırır. */
  const setManualDeclinationDeg = useCallback((next: number) => {
    const v = Math.max(
      -MANUAL_DECLINATION_LIMIT_DEG,
      Math.min(MANUAL_DECLINATION_LIMIT_DEG, Math.round(Number.isFinite(next) ? next : 0)),
    );
    st.current.manualDeclination = v;
    setManualDeclinationDegState(v);
    void AsyncStorage.setItem(MANUAL_DECL_STORAGE_KEY, String(v)).catch(() => undefined);
  }, []);

  /**
   * Demo (sahte kerteriz) anahtarı — varsayılan kapalı, kalıcı değil.
   *
   * Açıldığında ölçüm zinceri durur ve uydurma bir açı üretilir. `simulated`
   * bayrağı ekranda "DEMO" etiketiyle birlikte görünür; kullanıcı bunun ölçüm
   * olmadığını görebilmelidir. Kapalıyken ve manyetometre yoksa ekran kerteriz
   * göstermez (uydurma yok).
   */
  function setDemoMode(on: boolean) {
    setDemoModeState(on);
    setSimulated(on);
    if (on) {
      setSource('simulated');
      setAvailable(false);
      setHeadingDeg(null);
      setReady(false);
    } else if (!st.current.gotHeading) {
      // Kapatıldı: gerçek ölçüm varsa o kaynağa döner, yoksa donanım durumu
      // ne ise odur (manyetometre yoksa `no-magnetometer`).
      setSource(isNativeModulePresent() && isRotationVectorAvailable() ? 'system' : 'manual');
      setAvailable(magnetometerAvailable !== false);
      setHardware(
        magnetometerAvailable === false
          ? 'no-magnetometer'
          : magnetometerAvailable === true
            ? 'ready'
            : 'unknown',
      );
    }
  }

  // Kalıcı kalibrasyonu bir kez oku; sensör gelene kadar beklemesin.
  useEffect(() => {
    let alive = true;
    void Promise.all([
      AsyncStorage.getItem(OFFSET_STORAGE_KEY),
      AsyncStorage.getItem(MANUAL_DECL_STORAGE_KEY),
    ])
      .then(([rawOffset, rawDecl]) => {
        if (!alive) return;
        if (rawOffset !== null) {
          const parsed = Number(rawOffset);
          if (Number.isFinite(parsed)) {
            const v = clampUserOffset(parsed);
            st.current.offset = v;
            setOffsetDegState(v);
          }
        }
        if (rawDecl !== null) {
          const parsed = Number(rawDecl);
          if (Number.isFinite(parsed)) {
            const v = Math.max(
              -MANUAL_DECLINATION_LIMIT_DEG,
              Math.min(MANUAL_DECLINATION_LIMIT_DEG, Math.round(parsed)),
            );
            st.current.manualDeclination = v;
            setManualDeclinationDegState(v);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Sapma konum hook'undan beslenir. `true` moduna geçiş anında uygulanır;
   * değer `unwrap` ile en kısa yoldan kayar, zıplama olmaz.
   */
  const setDeclinationDeg = useCallback((deg: number | null) => {
    const v = deg !== null && Number.isFinite(deg) ? deg : null;
    st.current.declination = v;
    setDeclinationDegState(v);
  }, []);

  const setReference = (r: NorthReference) => {
    st.current.reference = r;
    setReferenceState(r);
  };

  useEffect(() => {
    let mounted = true;
    const s = st.current;
    const { sampleIntervalMs, fusionAlpha, emaAlpha, deadbandDeg } = compassMotion;
    const cleanups: (() => void)[] = [];

    /** Tek giriş noktası: ham kerterizi yumuşatır, açıya çevirir, yayınlar. */
    const push = (magHeading: number, alreadyFused: boolean, poseEvent?: DevicePose | null) => {
      s.gotHeading = true;
      // Sapma EMA'dan ÖNCE: mod değişimi unwrap ile yumuşar.
      const biased = applyUserOffset(magHeading, s.offset);
      const corrected =
        s.reference === 'true' && s.declination !== null
          ? applyDeclination(biased, s.declination)
          : biased;

      const now = Date.now();
      const dt = s.lastT > 0 ? Math.min((now - s.lastT) / 1000, 0.1) : sampleIntervalMs / 1000;
      s.lastT = now;

      if (alreadyFused) {
        s.fused = corrected;
        s.ready = true;
      } else {
        s.gyroBias += GYRO_BIAS_BETA * (s.lastGyroZ - s.gyroBias);
        const gyroDps = GYRO_SIGN * (s.lastGyroZ - s.gyroBias) * (180 / Math.PI);
        s.fused = s.ready ? complementaryStep(s.fused, gyroDps, dt, corrected, fusionAlpha) : corrected;
        s.ready = true;
      }

      s.ema = emaAngleStep(s.ema, s.fused, emaAlpha);
      const smooth = emaAngleRead(s.ema);

      // İLK ÖRNEK: 0 tohumu ekranda "uydurma kuzey" gösteriyordu. Şimdi ilk
      // gerçek değere doğrudan snap ediyoruz (yumuşatma değil, güvenilir veri).
      const first = !s.hasFirst;
      // Ölü bant: altındaki mikro-oynamalar UI'ya yazılmaz.
      if (!first && Math.abs(shortestDelta(normalizeAngle(s.unwrapped), smooth)) < deadbandDeg) {
        return;
      }
      const prevU = s.unwrapped;
      s.hasFirst = true;
      s.unwrapped = first ? smooth : unwrapStep(s.unwrapped, smooth);
      headingSV.set(s.unwrapped);

      if (first) {
        if (mounted) {
          setReady(true);
          const d0 = Math.round(normalizeAngle(smooth));
          s.lastShownDeg = d0;
          s.lastShownT = now;
          setHeadingDeg(d0);
          setLevel(isDeviceLevel(s.lastAccel));
          setBubble(levelFromAccel(s.lastAccel));
          if (poseEvent !== undefined) {
            s.lastPose = poseEvent;
            setPose(poseEvent);
          }
          const c0 = cardinalIndex(d0);
          s.lastCardinal = c0;
          setCardinalIdx(c0);
        }
        return;
      }

      if (crossedNorth(prevU, s.unwrapped) && mounted) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Kısılmış okuma: tam derece değiştiyse ve en az 200 ms geçtiyse.
      const deg = Math.round(normalizeAngle(s.unwrapped));
      if (deg !== s.lastShownDeg && now - s.lastShownT >= 200) {
        s.lastShownDeg = deg;
        s.lastShownT = now;
        if (mounted) {
          setHeadingDeg(deg);
          setLevel(isDeviceLevel(s.lastAccel));
          setBubble(levelFromAccel(s.lastAccel));
          if (poseEvent !== undefined && poseEvent !== s.lastPose) {
            s.lastPose = poseEvent;
            setPose(poseEvent);
          }
        }
      }
      const ci = cardinalIndex(deg);
      if (ci !== s.lastCardinal) {
        s.lastCardinal = ci;
        if (mounted) {
          setCardinalIdx(ci);
          if (s.lastCardinal !== -1) void Haptics.selectionAsync();
        }
      }
    };

    const classify = (field: number) => {
      const q = classifyFieldStrength(field, s.fieldQuality);
      if (mounted) setFieldStrength(Math.round(field));
      if (q !== s.fieldQuality) {
        s.fieldQuality = q;
        if (mounted) setFieldQuality(q);
      }
    };

    /**
     * Manuel JS füzyonu (yedek yol): ivmeölçer + manyetometre tilt-kompanzasyonu
     * + jiroskop complementary + EMA.
     *
     * ⚠️ İDEMPOTENT olmalı: tırmanma döngüsü bu fonksiyonu birden fazla çağırabilir
     * ve her çağrıda `Accelerometer`/`Gyroscope`/`Magnetometer` için YENİ
     * dinleyiciler ekliyordu — aynı sensör 3, 6, 9 kez dinleniyor, her tick'te
     * birkaç kez `push` çağrılıyor (gereksiz render + pil). `manualActive`
     * bayrağı ikinci çağrıyı no-op yapar, ayrıca biriken `cleanups` dizisinin
     * şişmesini engeller.
     *
     * Manyetometre yoksa bu yol da çalışmaz — o durum donanım meselesidir ve
     * `hardware === 'no-magnetometer'` ile zaten bildirilir; burada uydurma
     * kerteriz üretilmez.
     */
    const startManual = () => {
      if (s.manualActive) return;
      s.manualActive = true;
      Magnetometer.setUpdateInterval(sampleIntervalMs);
      Accelerometer.setUpdateInterval(sampleIntervalMs);
      Gyroscope.setUpdateInterval(sampleIntervalMs);
      const subA = Accelerometer.addListener((d) => {
        s.lastAccel = { x: d.x, y: d.y, z: d.z };
      });
      const subG = Gyroscope.addListener((d) => {
        s.lastGyroZ = d.z;
      });
      const subM = Magnetometer.addListener((d) => {
        const heading = tiltCompensatedHeading(d, s.lastAccel);
        classify(Math.hypot(d.x, d.y, d.z));
        push(heading, false);
      });
      cleanups.push(() => {
        s.manualActive = false;
        subM.remove();
        subA.remove();
        subG.remove();
      });
    };

    const switchToManual = () => {
      startManual();
      setSource('manual');
      setSensorAccuracy(null);
      s.lastPose = null;
      setPose(null);
    };

    let nativeSub: RotationSubscription | null = null;
    let nativeExtras: (() => void)[] = [];

    const onAccuracy = (e: SensorAccuracyEvent) => {
      if (mounted) setSensorAccuracy(e.accuracy);
    };

    /** Aboneliği ve ek izleyicilerini kapat (yeniden deneme için). */
    const stopNative = () => {
      const sub = nativeSub;
      nativeSub = null;
      if (sub) {
        try {
          sub.remove();
        } catch {
          // Zaten durmuş olabilir.
        }
      }
      nativeExtras.forEach((fn) => {
        try {
          fn();
        } catch {
          // Kapanışta sessiz geç.
        }
      });
      nativeExtras = [];
    };

    /** System yolunu (native rotation-vector + alan/level izleyicileri) başlatır. */
    const startNative = (): boolean => {
      if (!isNativeModulePresent() || !isRotationVectorAvailable()) return false;
      nativeSub = subscribeRotationVector(
        sampleIntervalMs,
        (e) => {
          /**
           * iOS artık skaler `headingDeg` göndermiyor; iki ham vektörü iletiyor ve
           * kerteriz `bearingFromSample()` ile BURADA, test edilmiş ortak
           * fonksiyondan hesaplanıyor. Böylece iOS ile Android aynı matematiği
           * kullanır ve iOS'taki attitude satır/sütun belirsizliği ortadan kalkar.
           *
           * `null` dönüşü: örnek kullanılamaz (bozuk vektör / eksik alan). Böyle
           * bir örnek ATILIR — NaN'ı 0'a çevirip ekrana uydurma kuzey basmak
           * yerine bir sonraki örneği bekleriz.
           */
          const h = bearingFromSample(e);
          if (h === null) return;
          push(h, true, e.pose);
        },
        onAccuracy,
      );
      // Alan şiddeti izleyicisi (parazit sınıflandırıcı için, 4 Hz — kerterize dokunmaz).
      Magnetometer.setUpdateInterval(250);
      const monitor = Magnetometer.addListener((d) => {
        classify(Math.hypot(d.x, d.y, d.z));
      });
      Accelerometer.setUpdateInterval(250);
      const lvlMon = Accelerometer.addListener((d) => {
        s.lastAccel = { x: d.x, y: d.y, z: d.z };
      });
      nativeExtras.push(() => {
        monitor.remove();
        lvlMon.remove();
      });
      setSource('system');
      setAvailable(true);
      return true;
    };

    if (!startNative()) {
      startManual();
    }

    /**
     * Yedek zincir: system → manual. **Simülasyona otomatik düşülmez.**
     *
     * ⚠️ Bu, canlı bir karar değişikliği ve bilinçli bir reddediş:
     * Önceden veri 2,5 saniye gelmezse uygulama sahte bir kerteriz üretmeye
     * geçiyordu ("Simülasyon modu (sensör yok)"). Galaxy J7 Prime 2 gibi
     * manyetometresi olmayan telefonlarda bu şu anlama geliyordu: kullanıcı
     * dönen bir kadran ve "2° Kuzey" görüyor, yani UYGULAMA BOZUK GÖRÜNÜYORDU —
     * üstelik okuma uydurmadı. Kullanıcı anında silip kötü puan verirdi.
     *
     * Doğrusu: manyetometre yoksa kerteriz FİZİKSEL olarak imkânsızdır. Bunu
     * saklamak yerine dürüstçe söylemek gerekir; ekranda `headingDeg` `null`
     * kalır, kadran soluklaşır ve akran "bu cihazda pusula yok" der.
     *
     * Simülasyon AYARLARDAN açıkça seçilebilir (demo amaçlı, varsayılan kapalı).
     */
    const escalation = setInterval(() => {
      if (!mounted || s.gotHeading) return;
      // Yalnızca native → manuel geçişi: ikisi de manyetometre ister, ikisi de
      // yoksa (donanım gerçekten yoksa) beklemenin anlamı yok.
      if (nativeSub && !s.manualActive) {
        stopNative();
        switchToManual();
        s.gotHeading = false;
        s.ready = false;
      }
    }, SENSOR_TIMEOUT_MS);
    cleanups.push(() => clearInterval(escalation));

    return () => {
      mounted = false;
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          // Kapanışta sessiz geç.
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    headingSV,
    headingDeg,
    ready,
    cardinalIdx,
    fieldStrength,
    fieldQuality,
    sensorAccuracy,
    pose,
    level,
    bubble,
    simulated,
    available,
    hardware,
    capabilities,
    demoMode,
    setDemoMode,
    source,
    reference,
    setReference,
    declinationDeg,
    setDeclinationDeg,
    offsetDeg,
    setOffsetDeg,
    manualDeclinationDeg,
    setManualDeclinationDeg,
  };
}
