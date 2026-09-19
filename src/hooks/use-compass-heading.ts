import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { compassMotion } from '../theme';
import {
  cardinalIndex,
  complementaryStep,
  createEmaState,
  emaAngleRead,
  emaAngleStep,
  isDeviceLevel,
  normalizeAngle,
  shortestDelta,
  tiltCompensatedHeading,
  unwrapStep,
  type EmaState,
} from '../utils/heading';

export interface CompassState {
  /** UI-thread animasyon değeri: sarmalanmamış sürekli açı (derece, sınırsız birikir). */
  headingSV: SharedValue<number>;
  /** Metin gösterimi için kısılmış değer (5 Hz, re-render dostu). */
  headingDeg: number;
  cardinalIdx: number;
  /** Manyetik alan şiddeti (µT) — parazit/kalibrasyon göstergesi. */
  fieldStrength: number;
  level: boolean;
  simulated: boolean;
  available: boolean;
}

/**
 * Android jiroskop işareti: +z ekseni, ekrana bakan gözle SAAT YÖNÜNÜN TERSİNE
 * pozitif döner (sağ-el kuralı). Pusula kerterizi saat yönünde artar →
 * jiro katkısı NEGATİF olmalı. Ters işaret, complementary filter'ı
 * manyetometreyle boğuşturur: bire-bir takip bozulur, tam tur sonrası
 * kaotik oturma görülür.
 */
const GYRO_SIGN = -1;
/** Jiro bias takibi (yavaş EMA β): dururken süzülen ofseti sıfırlar. */
const GYRO_BIAS_BETA = 0.002;

const SIM_FALLBACK_TIMEOUT_MS = 2500;

/**
 * Sensör füzyonu:
 * 1. İvmeölçer + manyetometre → tilt-kompanzasyonlu mutlak yön (50 Hz).
 * 2. Jiroskop z-hızı + mutlak yön → complementary filter (hızlı tepki, sürüklenmez).
 * 3. sin/cos EMA → son yumuşatma (sarım-güvenli).
 * 4. unwrap → UI-thread shared value'a doğrudan yazılır; re-render YOK.
 *
 * Sayısal okuma 5 Hz'e kısılır; haptic yalnızca kardinal değişiminde atar.
 */
export function useCompassHeading(): CompassState {
  const headingSV = useSharedValue(0);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [cardinalIdx, setCardinalIdx] = useState(0);
  const [fieldStrength, setFieldStrength] = useState(0);
  const [level, setLevel] = useState(true);
  const [simulated, setSimulated] = useState(false);
  const [available, setAvailable] = useState(true);

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
    gotMag: false,
    ready: false,
  });

  useEffect(() => {
    let mounted = true;
    const s = st.current;
    const { sampleIntervalMs, fusionAlpha, emaAlpha, deadbandDeg } = compassMotion;

    Magnetometer.setUpdateInterval(sampleIntervalMs);
    Accelerometer.setUpdateInterval(sampleIntervalMs);
    Gyroscope.setUpdateInterval(sampleIntervalMs);

    const push = (magHeading: number, field: number, lvl: boolean) => {
      const now = Date.now();
      const dt = s.lastT > 0 ? Math.min((now - s.lastT) / 1000, 0.1) : sampleIntervalMs / 1000;
      s.lastT = now;

      // Bias-takibli, işareti düzeltilmiş jiro hızı (derece/sn).
      s.gyroBias += GYRO_BIAS_BETA * (s.lastGyroZ - s.gyroBias);
      const gyroDps = GYRO_SIGN * (s.lastGyroZ - s.gyroBias) * (180 / Math.PI);
      s.fused = s.ready
        ? complementaryStep(s.fused, gyroDps, dt, magHeading, fusionAlpha)
        : magHeading;
      s.ready = true;

      s.ema = emaAngleStep(s.ema, s.fused, emaAlpha);
      const smooth = emaAngleRead(s.ema);

      // Ölü bant: 0.4° altındaki mikro-oynamalar UI'ya yazılmaz.
      // (Füzyon arka planda izlemeye devam eder; eşik aşılınca unwrap
      //  en-kısa-yaydan yetişir — sıçrama olmaz.)
      if (Math.abs(shortestDelta(normalizeAngle(s.unwrapped), smooth)) < deadbandDeg) {
        return;
      }
      s.unwrapped = unwrapStep(s.unwrapped, smooth);
      headingSV.set(s.unwrapped);

      // Kısılmış okuma: tam derece değiştiyse ve en az 200 ms geçtiyse.
      const deg = Math.round(normalizeAngle(s.unwrapped));
      if (deg !== s.lastShownDeg && now - s.lastShownT >= 200) {
        s.lastShownDeg = deg;
        s.lastShownT = now;
        if (mounted) {
          setHeadingDeg(deg);
          setFieldStrength(Math.round(field));
          setLevel(lvl);
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

    const subA = Accelerometer.addListener((d) => {
      s.lastAccel = { x: d.x, y: d.y, z: d.z };
    });
    const subG = Gyroscope.addListener((d) => {
      s.lastGyroZ = d.z;
    });
    const subM = Magnetometer.addListener((d) => {
      s.gotMag = true;
      const lvl = isDeviceLevel(s.lastAccel);
      const heading = tiltCompensatedHeading(d, s.lastAccel);
      const field = Math.hypot(d.x, d.y, d.z);
      push(heading, field, lvl);
    });

    // Sensör yoksa (emülatör/web) simülasyon — UI yine de doğrulanabilir.
    const simTimer = setTimeout(() => {
      if (!mounted || s.gotMag) return;
      setSimulated(true);
      setAvailable(false);
      let a = 0;
      const iv = setInterval(() => {
        if (!mounted) {
          clearInterval(iv);
          return;
        }
        a = (a + 0.6) % 360;
        s.unwrapped += 0.6;
        headingSV.set(s.unwrapped);
        const deg = Math.round(a);
        setHeadingDeg(deg);
        setCardinalIdx(cardinalIndex(deg));
      }, sampleIntervalMs);
    }, SIM_FALLBACK_TIMEOUT_MS);

    return () => {
      mounted = false;
      clearTimeout(simTimer);
      subM.remove();
      subA.remove();
      subG.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { headingSV, headingDeg, cardinalIdx, fieldStrength, level, simulated, available };
}
