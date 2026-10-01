import {
  deviceUtcOffsetMinutes,
  formatClock,
  julianDay,
  julianToUtcMs,
  localSunTimes,
  sunTimes,
} from './solar';

/** Saatleri "SS:DD" dakika değerine çevirir (test okunabilirliği için). */
const hm = (s: string): number => {
  const [h = 0, m = 0] = s.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Yayınlanan gün doğumu/batımı tabloları 1 dakikaya yuvarlar ve refraksiyon
 * varsayımları farklıdır; bu yüzden ±2 dakika toleransla doğrularız. Sahte
 * kesinlik (tam metin eşitliği) yanlış bir başarı ölçütü.
 */
function expectWithinMinutes(actual: string, expected: string, toleranceMin = 2): void {
  const diff = Math.abs(hm(actual) - hm(expected));
  const wrapped = Math.min(diff, 1440 - diff);
  expect(wrapped).toBeLessThanOrEqual(toleranceMin);
}

describe('julianDay', () => {
  it('round-trips with julianToUtcMs', () => {
    const ms = Date.UTC(2026, 5, 21, 12, 0);
    expect(julianToUtcMs(julianDay(ms))).toBeCloseTo(ms, -3);
  });
});

describe('sunTimes (published reference values, ±2 min)', () => {
  it('London solstice: 04:43 / 21:21 BST', () => {
    const t = sunTimes(Date.UTC(2026, 5, 21, 0, 0), 51.5074, -0.1278);
    expect(t).not.toBeNull();
    // +60 dk = BST
    expectWithinMinutes(formatClock(t!.sunriseUtcMin, 60), '04:43');
    expectWithinMinutes(formatClock(t!.sunsetUtcMin, 60), '21:21');
    expect(t!.dayLengthHours).toBeCloseTo(16.6, 0);
  });

  it('New York equinox: 07:00 / 19:07 EDT', () => {
    const t = sunTimes(Date.UTC(2026, 2, 20, 0, 0), 40.7128, -74.006);
    expectWithinMinutes(formatClock(t!.sunriseUtcMin, -240), '07:00');
    expectWithinMinutes(formatClock(t!.sunsetUtcMin, -240), '19:07');
  });

  it('Sydney winter solstice: 06:59 / 16:53 AEST', () => {
    const t = sunTimes(Date.UTC(2026, 5, 21, 0, 0), -33.8688, 151.2093);
    expectWithinMinutes(formatClock(t!.sunriseUtcMin, 600), '06:59');
    expectWithinMinutes(formatClock(t!.sunsetUtcMin, 600), '16:53');
  });

  it('southern and northern hemisphere seasons are inverted', () => {
    const june = sunTimes(Date.UTC(2026, 5, 21, 0, 0), 41.0082, 28.9784)!;
    const december = sunTimes(Date.UTC(2026, 11, 21, 0, 0), 41.0082, 28.9784)!;
    expect(june.dayLengthHours).toBeGreaterThan(14);
    expect(december.dayLengthHours).toBeLessThan(10);
  });

  it('returns null inside the polar circles (no sunrise/sunset)', () => {
    // Yaz: 75°K — güneş hiç batmaz. Kış: 75°K — güneş hiç doğmaz.
    expect(sunTimes(Date.UTC(2026, 5, 21, 0, 0), 75, 0)).toBeNull();
    expect(sunTimes(Date.UTC(2026, 11, 21, 0, 0), 75, 0)).toBeNull();
    // Kutup çemberi hemen dışında (64°N) yazın batımı gece yarısına denk gelir.
    expect(sunTimes(Date.UTC(2026, 5, 21, 0, 0), 64.1466, -21.9426)).not.toBeNull();
  });

  it('moves sunrise earlier as latitude increases in summer', () => {
    const eq = sunTimes(Date.UTC(2026, 5, 21, 0, 0), 0, 0)!;
    const north = sunTimes(Date.UTC(2026, 5, 21, 0, 0), 50, 0)!;
    // UTC'de kuzeyde daha erken doğar.
    expect(north.sunriseUtcMin).toBeLessThan(eq.sunriseUtcMin);
  });

  it('east of Greenwich rises earlier (longitude sign is not flipped)', () => {
    const west = sunTimes(Date.UTC(2026, 5, 21, 0, 0), 0, -30)!;
    const east = sunTimes(Date.UTC(2026, 5, 21, 0, 0), 0, 30)!;
    expect(east.sunriseUtcMin).toBeLessThan(west.sunriseUtcMin);
    // 60° boylam farkı = tam 4 saat = 240 dakika.
    expect(west.sunriseUtcMin - east.sunriseUtcMin).toBeCloseTo(240, 0);
  });
});

describe('formatClock', () => {
  it('wraps across midnight in both directions', () => {
    expect(formatClock(0, 0)).toBe('00:00');
    expect(formatClock(1439, 0)).toBe('23:59');
    expect(formatClock(1430, 60)).toBe('00:50');
    expect(formatClock(30, -60)).toBe('23:30');
  });

  it('rounds to the minute', () => {
    expect(formatClock(10.4, 0)).toBe('00:10');
    expect(formatClock(10.6, 0)).toBe('00:11');
  });
});

describe('deviceUtcOffsetMinutes', () => {
  it('is the inverse of getTimezoneOffset and stays finite', () => {
    const off = deviceUtcOffsetMinutes(Date.UTC(2026, 5, 21, 12, 0));
    expect(Number.isFinite(off)).toBe(true);
    expect(off % 15).toBe(0);
  });
});

describe('localSunTimes', () => {
  it('returns null without coordinates (no fake times)', () => {
    expect(localSunTimes(Date.UTC(2026, 5, 21, 0, 0), null, 28.9784, 180)).toBeNull();
    expect(localSunTimes(Date.UTC(2026, 5, 21, 0, 0), 41.0082, null, 180)).toBeNull();
  });

  it('formats both ends in the given zone', () => {
    const r = localSunTimes(Date.UTC(2026, 5, 21, 0, 0), 51.5074, -0.1278, 60);
    expect(r).not.toBeNull();
    expect(hm(r!.sunrise)).toBeLessThan(hm(r!.sunset));
    expect(r!.sunrise).toMatch(/^\d{2}:\d{2}$/);
    expect(r!.sunset).toMatch(/^\d{2}:\d{2}$/);
  });

  it('Istanbul summer: sunrise before 06:00, sunset after 20:00 TRT', () => {
    const r = localSunTimes(Date.UTC(2026, 5, 21, 0, 0), 41.0082, 28.9784, 180)!;
    expect(hm(r.sunrise)).toBeLessThan(6 * 60);
    expect(hm(r.sunset)).toBeGreaterThan(20 * 60);
    // Gündüz İstanbul yazın ~15 saat.
    expect(r.dayLengthHours).toBeGreaterThan(14.5);
  });
});
