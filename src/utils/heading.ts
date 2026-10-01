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
  if (r < 0) {
    // Kayan nokta artığı: tam kuzeyin 1e-14 kadar altındaki bir değer 360'a
    // yuvarlanıp "360°" olarak ekrana çıkabiliyordu. 360 ≡ 0 olduğu için
    // son 1e-9 dereceyi 0'a kapatıyoruz.
    const wrapped = r + 360;
    return wrapped > 360 - 1e-9 ? 0 : wrapped;
  }
  return r === 0 ? 0 : r;
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

export interface Vec3 {
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

/** 16'lı rüzgar gülü indeksi (0–15). */
export function cardinalIndex(heading: number): number {
  return Math.round(normalizeAngle(heading) / 22.5) % 16;
}

/**
 * Kadranın N/E/S/W harfleri uluslararası sabittir ve DİL DEĞİŞTİRMEZ
 * (kullanıcı kararı). Derece okuması ise APP DİLİNDE yön adı gösterir:
 * Türkçe "60° Kuzey", İngilizce "60° North".
 */
/**
 * Cihaz koordinatlarından tam 3B, eğim-kompanzasyonlu kerteriz.
 *
 * Neden bu yol var: iOS tarafı daha önce `CMAttitude` quaternion'ından bir
 * dönüş matrisi kurup kendi kerterizini Swift içinde hesaplıyordu. Apple'ın
 * "attitude hangi yöne dönüş?" sözleşmesi (satır mı sütun mu) belirsiz olduğu
 * için o yol test EDİLEMEYEN bir çerçeve varsayımına dayanıyordu ve canlıda
 * yanlış yön verdi. Burada yalnızca İKİ ham vektör kullanılır:
 *
 *   g = yerçekimi (cihaz koordinatlarında, AŞAĞI doğru — CoreMotion sözleşmesi)
 *   m = manyetik alan (cihaz koordinatlarında, manyetik KUZEYE doğru)
 *
 * Bunlar belirsizliğe yer bırakmaz; kuzey ve doğu doğrudan türetilir:
 *   up    = -g                 (yukarı)
 *   north = normalize(m - up(m·up))    → manyetik alanın YATAY izdüşümü
 *   east  = normalize(north × up)      → ENU sağ el kuralı
 *   başlık = atan2(v·east, v·north)
 *
 * Referans vektör `v` (telefonun baktığı yön) yine el değiştirmeli harmanlanır:
 *   telefon YATAY → üst kenarın yatay izdüşümü (kesin yön)
 *   telefon DİK   → ekran normali = baktığın yön (üst kenar dikeyde tanımsız)
 *
 * ⚠️ `GRAVITY_POINTS_DOWN` doğruysa needles saat yönünde döner. Yanlışsa
 * iğne AYNADA döner (anlık ve çok belirgin bir belirti, 1° gibi bir kayma
 * değil) — o durumda tek sabit çevrilir.
 */
const GRAVITY_POINTS_DOWN = true;

const DEV_TOP_EDGE: Vec3 = { x: 0, y: 1, z: 0 };
/** Dik tutulduğunda ölçülen yön: kullanıcının BAKTIĞI yön = ekranın tersi. */
const DEV_GAZE: Vec3 = { x: 0, y: 0, z: -1 };

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm3(v: Vec3): number {
  return Math.sqrt(dot3(v, v));
}

function unit(v: Vec3): Vec3 {
  const n = norm3(v);
  if (n < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

/** Vektörün `up` dikdüzlemindeki (yatay) bileşeni. */
function horizontalPart(v: Vec3, up: Vec3): Vec3 {
  const d = dot3(v, up);
  return { x: v.x - up.x * d, y: v.y - up.y * d, z: v.z - up.z * d };
}

function smoothstep01(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

export interface RawHeadingResult {
  /** 0 = manyetik kuzey, saat yönünde. */
  heading: number;
  /** Üst kenarın yatay izdüşüm büyüklüğü (0 = tamamen dikey). */
  topHorizontal: number;
}

/**
 * Ham yerçekimi + manyetik alan → kerteriz (3B, çerçeve bağımsız).
 *
 * @param g yerçekimi, cihaz koordinatlarında (CoreMotion / RN ivmeölçer)
 * @param m manyetik alan, cihaz koordinatlarında
 */
export function headingFromRawVectors(g: Vec3, m: Vec3): RawHeadingResult {
  const up = unit(
    GRAVITY_POINTS_DOWN
      ? { x: -g.x, y: -g.y, z: -g.z }
      : { x: g.x, y: g.y, z: g.z },
  );
  if (norm3(up) < 0.5) return { heading: NaN, topHorizontal: 0 };

  const north = unit(horizontalPart(m, up));
  if (norm3(north) < 1e-6) return { heading: NaN, topHorizontal: 0 };
  const east = unit(cross3(north, up));
  if (norm3(east) < 1e-6) return { heading: NaN, topHorizontal: 0 };

  // Referans: yatayken üst kenar, dikken ekranın baktığı yön (−z, DEV_GAZE).
  const f = horizontalPart(DEV_TOP_EDGE, up);
  const mf = norm3(f);
  const k = smoothstep01((mf - TOP_EDGE_DEAD) / (TOP_EDGE_TRUST - TOP_EDGE_DEAD));
  const gaze = horizontalPart(DEV_GAZE, up);
  let v: Vec3 = {
    x: k * f.x + (1 - k) * gaze.x,
    y: k * f.y + (1 - k) * gaze.y,
    z: k * f.z + (1 - k) * gaze.z,
  };
  if (norm3(v) < 1e-9) v = mf > 0 ? f : gaze;

  const heading = Math.atan2(dot3(v, east), dot3(v, north)) * DEG_PER_RAD;
  return { heading: normalizeAngle(heading), topHorizontal: mf };
}

/**
 * Tek bir sensör örneğinden kerteriz çıkarır — iki platformun sözleşmesi.
 *
 * - Ham vektör varsa (iOS) → `headingFromRawVectors`.
 * - Skaler varsa (Android) → doğrudan onu kullan.
 * - **Geçerli kerteriz üretilemiyorsa `null`.** Çağıran bu örneği ATAR; 0°'e
 *   düşmez. Aksi halde bozuk bir örnek ekranda yanlış yön gösterirdi.
 *
 * iOS skaler alanı hiç göndermez (NaN göndermemek için); bu yüzden "eksik alan"
 * bir hatadır, 0° değildir.
 */
export function bearingFromSample(sample: {
  headingDeg?: number;
  gravity?: Vec3;
  mag?: Vec3;
}): number | null {
  if (sample.gravity && sample.mag) {
    const h = headingFromRawVectors(sample.gravity, sample.mag).heading;
    return Number.isFinite(h) ? h : null;
  }
  return typeof sample.headingDeg === 'number' && Number.isFinite(sample.headingDeg)
    ? sample.headingDeg
    : null;
}

/** 8'lı yön indeksi (0–7) ve 45° adımlı yön anahtarı. */const DIRECTION_KEYS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

export type DirectionKey = (typeof DIRECTION_KEYS)[number];

/** 45° adımlı 8 yön indeksi (0–7). */
export function directionIndex(heading: number): number {
  return Math.round(normalizeAngle(heading) / 45) % 8;
}

/** Derece + app dilinde yön adı: `60 → "60° Kuzey"` (türkiye). */
export function directionName(
  heading: number,
  t: (key: string) => string,
): string {
  return t(`compass.directions.${DIRECTION_KEYS[directionIndex(heading)]}`);
}

/**
 * Ekranda gösterilecek tam derece.
 *
 * Neden: `Math.round(359.6)` → `360`, ama 360° ≡ 0°. Kullanıcı "derece bilgi
 * ekranı 359 derece sonrasında sıfır ile yeniden başlasın" dedi; sarmalama
 * burada yapılır, yani 359.6° ekranda `0°` görünür.
 */
export function displayDegrees(heading: number): number {
  return ((Math.round(heading) % 360) + 360) % 360;
}

// ---------------------------------------------------------------------------
// Gerçek kuzey, parazit sınıflandırıcı, su terazisi, kuzey-geçiş algısı
// (v2 motor: native rotation-vector birincil, aşağıdaki JS füzyon yedeği).
// ---------------------------------------------------------------------------

/**
 * Manyetik kerteriz + doğu-pozitif sapma (declination) → gerçek (coğrafi) kuzey kerterizi.
 * Örn: manyetik 320°, sapma +6°D → gerçek 326°.
 */
export function applyDeclination(magHeadingDeg: number, declinationEastDeg: number): number {
  return normalizeAngle(magHeadingDeg + declinationEastDeg);
}

/** Kullanıcı manyetik ofsetinin sınırları (derece) — cihaz bias düzeltmesi. */
export const USER_OFFSET_LIMIT_DEG = 20;

/**
 * Kullanıcı manyetik ofseti (derece) — cihazın hard-iron bias'ını bilinçli olarak
 * düzeltir. Pozitif = okumayı saat yönünde kaydırır. Sapma (declination) gibi
 * sarmalanır; `USER_OFFSET_LIMIT_DEG` ile sınırlanır.
 *
 * Sıralama önemli: ofset MAGNETİK uzayda uygulanır, sapma ondan SONRA gelir
 * (-ofset sonrası gerçek kuzey = ofsetli manyetik + declination).
 */
export function applyUserOffset(magHeadingDeg: number, offsetDeg: number): number {
  const clamped = Math.max(-USER_OFFSET_LIMIT_DEG, Math.min(USER_OFFSET_LIMIT_DEG, offsetDeg));
  return normalizeAngle(magHeadingDeg + clamped);
}

/** Ofset girdisini adım+kapsam içine kırpır (UI ve kalıcı depolama için). */
export function clampUserOffset(offsetDeg: number): number {
  if (!Number.isFinite(offsetDeg)) return 0;
  return Math.max(-USER_OFFSET_LIMIT_DEG, Math.min(USER_OFFSET_LIMIT_DEG, Math.round(offsetDeg)));
}

export type FieldQuality = 'normal' | 'suspect' | 'interference';

/**
 * Manyetik alan şiddeti (µT) sınıflandırıcı — histerezisli.
 *
 * - 25–65 µT: normal (dünya alanı; İstanbul ~48 µT).
 * - 20–25 / 65–80 µT: şüpheli (yakında metal/mıknatıs olabilir).
 * - <20 / >80 µT: parazit (uyarı + figure-8 kalibrasyon önerisi).
 *
 * Histerezis: uyarıya girerken geniş bant (<20/>80), çıkarken dar bant (25–65)
 * kullanılır; eşik üstünde titreyen okuma banner'ı yakıp söndürmez.
 * `prev` = önceki sınıflandırma (titreme önleme için çağrı tarafı saklar).
 */
export function classifyFieldStrength(strengthMicroTesla: number, prev: FieldQuality): FieldQuality {
  const s = strengthMicroTesla;
  if (!Number.isFinite(s)) return prev;
  if (prev === 'interference') {
    return s >= 25 && s <= 65 ? 'normal' : prev;
  }
  if (prev === 'suspect') {
    if (s >= 25 && s <= 65) return 'normal';
    if (s < 20 || s > 80) return 'interference';
    return 'suspect';
  }
  if (s < 20 || s > 80) return 'interference';
  if (s < 25 || s > 65) return 'suspect';
  return 'normal';
}

export interface LevelReading {
  /** Öne/arkaya eğim (derece, + = üst kenar yukarıda). */
  pitchDeg: number;
  /** Sağa/sola yatış (derece, + = sağa yatık). */
  rollDeg: number;
  /** Su-terazisi baloncuğu ofseti, -1..1 (UI yarıçapıyla çarpılır). */
  bubbleX: number;
  bubbleY: number;
}

/**
 * İvmeölçerden su terazisi okuması. Telefon yüzü yukarı, portre varsayımıyla:
 * pitch = atan2(-ay, az), roll = atan2(ax, az). Baloncuk ±25°'de tam sapar.
 */
export function levelFromAccel(accel: AccelSample): LevelReading {
  const { x, y, z } = accel;
  const horiz = Math.hypot(x, y);
  if (horiz < 1e-6 && Math.abs(z) < 1e-6) {
    return { pitchDeg: 0, rollDeg: 0, bubbleX: 0, bubbleY: 0 };
  }
  const pitchDeg = Math.atan2(-y, Math.hypot(x, z)) * DEG_PER_RAD;
  const rollDeg = Math.atan2(x, Math.hypot(y, z)) * DEG_PER_RAD;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v / 25));
  return { pitchDeg, rollDeg, bubbleX: clamp(rollDeg), bubbleY: clamp(-pitchDeg) };
}

/**
 * Kuzey-geçiş algısı (kuzey haptic'i için): sarmalanmamış açı akışı 0°'ın
 * tam katını geçtiyse true. Örn: 359.7 → 360.2 geçiş; 10 → 20 geçiş değil.
 */
export function crossedNorth(prevUnwrapped: number, nextUnwrapped: number): boolean {
  return Math.floor(nextUnwrapped / 360) !== Math.floor(prevUnwrapped / 360);
}

// ---------------------------------------------------------------------------
// Pose-aware kerteriz: sistem rotation-vector yolunun Kotlin aynası.
// (Native modül bu mantığı çalıştırır; buradaki kopya test + dokümantasyon
//  içindir — iki taraf da aynı sözleşmeye uyar.)
// ---------------------------------------------------------------------------

export type DevicePose = 'flat' | 'upright';

/**
 * Tutuş modu histerezisi: ekrana `sz` = ekran normalinin dünya-Z bileşeni
 * verilir (|sz|≈1 düz, ≈0 dik). Sınırda (0.4/0.6) mod titremez.
 *
 * ⚠️ v3: bu etiket ARTIK kerteriz matematiğine GİRMEZ — yalnızca arayüz ipucu
 * (`pose`) üretir. Kerteriz `headingFromRotationMatrix` içinde eşiksiz harmanla
 * hesaplanır; anahtarlama orta eğimde 90°'lik sıçrama yapıyordu.
 */
export function poseStep(prev: DevicePose, sz: number): DevicePose {
  const a = Math.abs(sz);
  if (prev === 'upright') return a > 0.6 ? 'flat' : 'upright';
  return a < 0.4 ? 'upright' : 'flat';
}

/**
 * Tutuş sözleşmesi el değiştirme eşikleri (üst kenarın yatay izdüşüm büyüklüğü).
 *
 * - `|f| ≥ TRUST` → üst kenar YETERLİ: saf tilt-kompanzasyonlu kerteriz.
 * - `|f| ≤ DEAD`  → üst kenar ÖLÜ (neredeyse dikey): saf bakış yönü.
 * - arada smoothstep ile dar bir geçiş bandı.
 *
 * Neden dar? Geniş bant (ör. güvenilirlikle orantılı) iki sözleşme AYNIDA
 * antiparalel olduğunda (üst kenar tam kuzeydeyken) harman vektörü sıfırdan
 * geçiyor ve 180°'lik sıçrama yapıyordu — ölçüldü: yaw=0, 46° eğimde 180°.
 * Dar bant bunu tersine çevirir: 0–75° eğimde okuma BİREBİR düz kerteriz
 * kalıyor (ölçülen en büyük adım 0.0000°), el değişimi yalnızca üst kenarın
 * gerçekten tanımsızlaştığı 78°+ bandında başlıyor.
 */
const TOP_EDGE_TRUST = 0.25;
const TOP_EDGE_DEAD = 0.02;

/**
 * Rotasyon matrisinden (row-major 9 eleman, cihaz→dünya; dünya X=doğu,
 * Y=manyetik kuzey, Z=yukarı) kerteriz — POZ KÖRÜ, dar bantlı yumuşak el değişimi.
 *
 * İki yatay referans vektörü, iki FARKLI tutuş sözleşmesidir:
 * - `f` = üst kenarın yatay izdüşümü (R[1],R[4]) → telefonu DÜZ tuttuğunda
 *   doğru yanıt (tilt-kompanzasyonlu kerteriz). TÜM kullanışlı duruşlarda geçerli.
 * - `g` = −ekran normalinin yatay izdüşümü = bakış yönü (−R[2],−R[5]) → yalnızca
 *   üst kenar dikeyken (telefon ayakta) anlamlı.
 *
 * v2 bu ikisini `|R[8]|` 0.4/0.6 eşiğiyle ANALTIRDI ve 30–70° bandında 90°'lik
 * sıçramalar yapıyordu — kullanıcı bunu "telefonu döndürünce kadran alakasız bir
 * yerde yanlış duruyor" olarak yaşadı. v3'te el değişimi `|f|`'in güvenilirliğine
 * bağlı ve yalnızca üst kenarın yatay izdüşümü çöktüğünde başlar; 0–75° eğimde
 * okuma hatasız kalır. `pose` sadece arayüz ipucudur, hesaba GİRMEZ.
 */
export function headingFromRotationMatrix(
  r: number[],
  prevPose: DevicePose,
): { heading: number; pose: DevicePose } {
  const [, r1 = 0, r2 = 0, , r4 = 0, r5 = 0, , , r8 = 0] = r;
  const pose = poseStep(prevPose, r8);
  const fx = r1;
  const fy = r4;
  // ⚠️ Dik tutulduğunda ölçtüğümüz şey EKRANA BAKAN YÖN değil, KULLANICININ BAKTIĞI
  // yöndür: kullanıcı ekrana bakar, yani ekranın tersi. Ekranın dış normali
  // (+z) telefonun baktığı yönü verir, onun negatifi kullanıcının bakışını.
  // Bu yüzden -z. (Bunu ters çevirmek, telefonu dik tutunca 180° döndürür —
  // canlıda ölçülerek doğrulandı, bkz. heading-raw.test.ts.)
  const gx = -r2;
  const gy = -r5;
  const mf = Math.hypot(fx, fy);
  const raw = Math.max(0, Math.min(1, (mf - TOP_EDGE_DEAD) / (TOP_EDGE_TRUST - TOP_EDGE_DEAD)));
  const k = raw * raw * (3 - 2 * raw);
  let vx = k * fx + (1 - k) * gx;
  let vy = k * fy + (1 - k) * gy;
  // Savunma: iki vektör tam antiparalelse toplam sıfır olabilir → üst karede kal.
  if (vx * vx + vy * vy < 1e-12) {
    if (mf > 0) {
      vx = fx;
      vy = fy;
    } else {
      vx = gx;
      vy = gy;
    }
  }
  return { heading: normalizeAngle(Math.atan2(vx, vy) * DEG_PER_RAD), pose };
}

/** Su-terazisi "düz" kararı: eğim büyüklüğü tolerans içindeyse true. */
export function isLevelReading(pitchDeg: number, rollDeg: number, toleranceDeg = 2.5): boolean {
  return Math.hypot(pitchDeg, rollDeg) <= toleranceDeg;
}
