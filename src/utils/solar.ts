/**
 * Güneş doğuş/batış hesabı — saf, çevrimdışı, anahtarsız (NOAA denklemleri).
 *
 * Neden kendi hesabımız: bir web API'si hem anahtar ister hem de internetsiz
 * çalışmaz; pusula uygulaması dışarıya bağımlı olmamalı. Sonuç gün doğumu ve
 * batımı UTC dakikası olarak döner; yerel saate çevirmek çağıranın işidir
 * (`getTimezoneOffset` — cihazın kendi saat dilimini kullanır).
 *
 * Doğrulama (testlerde ±2 dk toleransla sabitlenmiştir):
 *   Londra  2026-06-21 → 04:43 / 21:21 (BST)
 *   New York 2026-03-20 → 07:00 / 19:07 (EDT)
 *   Sidney   2026-06-21 → 06:59 / 16:53 (AEST)
 *   70°K (yaz) → doğuş/batış YOK (kutup gecesi/gündüzü) → null
 */

const RAD = Math.PI / 180;

/** Güneş 0.833° alacalanma açısı (refraksiyon + yarıçap düzeltmesi birlikte). */
const SUN_ALTITUDE_DEG = -0.833;

const J1970 = 2440587.5;
const J2000 = 2451545.0;

export function julianDay(utcMs: number): number {
  return utcMs / 86400000 + J1970;
}

export function julianToUtcMs(jd: number): number {
  return (jd - J1970) * 86400000;
}

export interface SunTimes {
  /** Gece yarısından itibaren geçen dakika (UTC). */
  sunriseUtcMin: number;
  sunsetUtcMin: number;
  /** Gündüz uzunluğu (saat). */
  dayLengthHours: number;
}

/**
 * Verilen UTC anı için güneş doğuş/batışı. Kutup gündüzü/gecesi veya güneşin
 * hiç doğmadığı durumlar `null` döner.
 */
export function sunTimes(utcMs: number, latDeg: number, lonDeg: number): SunTimes | null {
  // n: J2000'den (2000-01-01 12:00 UTC) itibaren tamsayı gün. Dikkat: 00:00 UTC
  // için Jülyen tarihin kesirli kısmı 0.5'tir; 0.0008 düzeltmesi yalnızca
  // ceil() içinde uygulanır (kaydırılırsa okuma ~1 dk erken gelir).
  const n = Math.ceil(julianDay(utcMs) - J2000 + 0.0008);
  // Doğuş/batım J*'ı meridyen kaydırması içerir: doğuda batıdan daha erken.
  const jStar = n - lonDeg / 360;
  const meanAnomaly = (357.5291 + 0.98560028 * jStar) % 360;
  const center =
    1.9148 * Math.sin(meanAnomaly * RAD) +
    0.02 * Math.sin(2 * meanAnomaly * RAD) +
    0.0003 * Math.sin(3 * meanAnomaly * RAD);
  const eclipticLon = (meanAnomaly + center + 180 + 102.9372) % 360;
  const solarTransit =
    J2000 + jStar + 0.0053 * Math.sin(meanAnomaly * RAD) - 0.0069 * Math.sin(2 * eclipticLon * RAD);
  const sinDecl = Math.sin(eclipticLon * RAD) * Math.sin(23.4397 * RAD);
  const cosDecl = Math.cos(Math.asin(sinDecl));
  const cosHourAngle =
    (Math.sin(SUN_ALTITUDE_DEG * RAD) - Math.sin(latDeg * RAD) * sinDecl) /
    (Math.cos(latDeg * RAD) * cosDecl);
  // |cos ω| > 1 → güneş bu gün doğmaz/batmaz (kutup gecesi ya da yaz gecesi).
  if (!(Math.abs(cosHourAngle) <= 1)) return null;
  const hourAngle = Math.acos(cosHourAngle) / RAD;
  return {
    sunriseUtcMin: utcMinutesOf(solarTransit - hourAngle / 360),
    sunsetUtcMin: utcMinutesOf(solarTransit + hourAngle / 360),
    dayLengthHours: (2 * hourAngle) / 15,
  };
}

function utcMinutesOf(jd: number): number {
  const d = new Date(julianToUtcMs(jd));
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Cihazın o anki UTC sapmasını dakika cinsinden döndürür (DST'i de yakalar). */
export function deviceUtcOffsetMinutes(atMs: number = Date.now()): number {
  return -new Date(atMs).getTimezoneOffset();
}

/** UTC dakikasını verilen saat dilimi sapmasında `SS:DD` biçimine çevirir. */
export function formatClock(utcMinutes: number, tzOffsetMinutes: number): string {
  const total = ((Math.round(utcMinutes) + tzOffsetMinutes) % 1440 + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Cihaz saat diliminde doğuş/batım saatleri; konum yoksa null. */
export function localSunTimes(
  utcMs: number,
  latDeg: number | null,
  lonDeg: number | null,
  tzOffsetMinutes: number = deviceUtcOffsetMinutes(),
): { sunrise: string; sunset: string; dayLengthHours: number } | null {
  if (latDeg === null || lonDeg === null) return null;
  const t = sunTimes(utcMs, latDeg, lonDeg);
  if (!t) return null;
  return {
    sunrise: formatClock(t.sunriseUtcMin, tzOffsetMinutes),
    sunset: formatClock(t.sunsetUtcMin, tzOffsetMinutes),
    dayLengthHours: t.dayLengthHours,
  };
}
