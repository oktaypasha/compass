/**
 * Pusula matematiği — saf fonksiyonlar (UI-thread / JS-thread bağımsız, unit-testli).
 *
 * Tasarım kararları (süpervizör onaylı, proje-üstü geçerli):
 * - Açı üzerinde doğrudan Low-Pass Filter YOK (359°→0° sarımında 359°'lik hayalet dönüş üretir).
 *   Bunun yerine sin/cos bileşenleri üzerinde EMA uygulanır, sonra atan2 ile açıya dönülür.
 * - Animasyon her zaman en kısa yay üzerinden yapılır: delta ∈ (-180°, +180°].
 * - Kalman filtresi v1'de YOK: telefon sensörlerinde ayar maliyeti/faydası negatiftir.
 *   Bunun yerine jiroskop (hızlı, sürüklenir) + manyetometre (mutlak, gürültülü) için
 *   Complementary Filter kullanılır — iOS CoreLocation füzyonunun uygulama-seviyesi karşılığı.
 * - Telefon dik tutulduğunda manyetometre x/y tek başına yanlıştır; ivmeölçer ile
 *   tilt-kompanzasyonu uygulanır.
 */

export const DEG_PER_RAD = 180 / Math.PI;

/** Açıyı [0, 360) aralığına normalize eder. */
export function normalizeAngle(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/**
 * En kısa yay farkı: hedeften akıma giden işaretli delta, (-180, 180] aralığında.
 * Örn: current=359, target=1 → +2 (saat yönünde 2°, ters yöne 358° değil).
 */
export function shortestDelta(current: number, target: number): number {
  return ((target - current + 540) % 360) - 180;
}

/** Ham manyetometre (µT) → telefon üst kenarının kerterizi (derece). Eğim yok varsayımıyla. */
export function headingFromMagnetometer(x: number, y: number): number {
  // Dikkat: atan2(y, x) DEĞİL. Telefon üst kenarı +Y'dir; kerteriz
  // atan2(-x, y) ile bulunur (tilt metodunun düz-telefon limitiyle aynı).
  return normalizeAngle(Math.atan2(-x, y) * DEG_PER_RAD);
}

export interface AccelSample {
  x: number;
  y: number;
  z: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(v: Vec3): Vec3 {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

/**
 * Tilt-kompanzasyonlu yön — vektör formülasyonu (işaret hatasına dayanıklı).
 *
 * Yöntem: yerçekimi vektörü (ivmeölçer) "yukarı"yı verir. Manyetik vektörün
 * dikey bileşeni atılır → yatay kuzey (N). Doğu E = N × yukarı
 * (DİKKAT: yukarı × N = BATI verir — aynalanmış pusulanın klasik hatası).
 * Telefonun üst kenarı (0,1,0) yatay düzleme izdüşürülür (f); pusula kerterizi
 * = atan2(f·E, f·N) (kuzeyden saat yönünde).
 *
 * Telefon tam dikeyken üst-kenar izdüşümü çöker → yedek olarak ekran normalinin
 * tersi (-z, kullanıcının baktığı yön) kullanılır.
 */
export function tiltCompensatedHeading(
  mag: { x: number; y: number; z: number },
  accel: AccelSample,
): number {
  const g = norm(accel);
  const b: Vec3 = { x: mag.x, y: mag.y, z: mag.z };

  const vertical = dot(b, g);
  const h: Vec3 = { x: b.x - vertical * g.x, y: b.y - vertical * g.y, z: b.z - vertical * g.z };
  const hMag = Math.hypot(h.x, h.y, h.z);
  if (hMag < 5) {
    // Aşırı parazit/kutup bölgesi — düz formüle düş.
    return headingFromMagnetometer(mag.x, mag.y);
  }
  const n = norm(h);
  const e = cross(n, g);

  const top: Vec3 = { x: 0, y: 1, z: 0 };
  const topDot = dot(top, g);
  let f: Vec3 = { x: top.x - topDot * g.x, y: top.y - topDot * g.y, z: top.z - topDot * g.z };
  if (Math.hypot(f.x, f.y, f.z) < 0.2) {
    const back: Vec3 = { x: 0, y: 0, z: -1 };
    const backDot = dot(back, g);
    f = { x: back.x - backDot * g.x, y: back.y - backDot * g.y, z: back.z - backDot * g.z };
    if (Math.hypot(f.x, f.y, f.z) < 0.2) {
      return headingFromMagnetometer(mag.x, mag.y);
    }
  }

  return normalizeAngle(Math.atan2(dot(f, e), dot(f, n)) * DEG_PER_RAD);
}

/** Cihazın kabaca düz (pusula-güvenilir) tutulup tutulmadığı. |a| yerçekimine yakınsa true. */
export function isDeviceLevel(accel: AccelSample, tolerance = 3.5): boolean {
  const mag = Math.hypot(accel.x, accel.y, accel.z);
  return Math.abs(mag - 9.81) < tolerance;
}

export interface EmaState {
  sin: number;
  cos: number;
  initialized: boolean;
}

/** Yeni EMA durumu üretir (saf, test edilebilir). */
export function createEmaState(): EmaState {
  return { sin: 0, cos: 0, initialized: false };
}

/**
 * Açı üzerinde EMA — sin/cos uzayında. alpha küçüldükçe yumuşar ama gecikir.
 * Önerilen: 0.15 – 0.3 (50 Hz örneklemede).
 */
export function emaAngleStep(state: EmaState, angleDeg: number, alpha: number): EmaState {
  const rad = (normalizeAngle(angleDeg) / 180) * Math.PI;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  if (!state.initialized) {
    return { sin: s, cos: c, initialized: true };
  }
  return {
    sin: state.sin + alpha * (s - state.sin),
    cos: state.cos + alpha * (c - state.cos),
    initialized: true,
  };
}

/** EMA durumundan açı okur. */
export function emaAngleRead(state: EmaState): number {
  if (!state.initialized) return 0;
  return normalizeAngle(Math.atan2(state.sin, state.cos) * DEG_PER_RAD);
}

/**
 * Complementary filter adımı (saf):
 * - `prevFused`: önceki füzyon çıktısı (derece)
 * - `gyroRateDps`: z-ekseni açısal hız (derece/sn, işaret cihaza göre kalibre edilir)
 * - `dt`: saniye
 * - `magHeading`: manyetometre mutlak yönü (derece)
 * - `alpha`: manyetometre düzeltme kazancı (0.02 – 0.08). Küçük = jiroskop ağırlıklı (akıcı),
 *   büyük = manyetometre ağırlıklı (sürüklenmez ama gürültülü).
 */
export function complementaryStep(
  prevFused: number,
  gyroRateDps: number,
  dt: number,
  magHeading: number,
  alpha: number,
): number {
  const predicted = prevFused + gyroRateDps * dt;
  return normalizeAngle(predicted + alpha * shortestDelta(predicted, magHeading));
}

/**
 * Sürekli (unwrapped) açı takibi: animasyon değeri hiç sarmalanmaz, dönüşler birikir.
 * UI-thread'deki shared value bu değeri taşır; sarmalama sadece gösterimde yapılır.
 */
export function unwrapStep(prevUnwrapped: number, nextHeading: number): number {
  return prevUnwrapped + shortestDelta(normalizeAngle(prevUnwrapped), nextHeading);
}

const CARDINALS_TR = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'] as const;
const CARDINALS_EN = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;

/** 16'lı rüzgar gülü indeksi (0–15). */
export function cardinalIndex(heading: number): number {
  return Math.round(normalizeAngle(heading) / 22.5) % 16;
}

/** Yerelleştirilmiş kardinal etiketi. Desteklenmeyen dil → İngilizce. */
export function cardinalLabel(heading: number, locale: string): string {
  const idx = cardinalIndex(heading);
  return (locale.startsWith('tr') ? CARDINALS_TR[idx] : CARDINALS_EN[idx]) ?? 'N';
}
