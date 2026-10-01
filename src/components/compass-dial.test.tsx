import { displayDegrees, directionIndex, directionName } from '../utils/heading';
import { i18n } from '../i18n';
import { DEGREE_LABELS, TICKS } from './compass-dial';

describe('DEGREE_LABELS', () => {
  it('is 0..330 in 30 degree steps, never 360', () => {
    // 360° ≡ 0°: kuzey zaten tepede, 360'ı basmak aynı yönü iki kez göstermek.
    expect([...DEGREE_LABELS]).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    expect(DEGREE_LABELS).not.toContain(360);
  });
});

describe('TICKS', () => {
  it('has one tick per degree and nothing at 360', () => {
    expect(TICKS).toHaveLength(360);
    expect(TICKS.map((t) => t.angle)).not.toContain(360);
  });

  it('lengthens and thickens the tick at every 5, 10 and 30 degrees', () => {
    const at = (a: number) => TICKS.find((t) => t.angle === a)!;
    // Kullanıcı: "taksimat çizgileri kısa, uzat; ana yön çizgilerini kalınlaştır".
    // Referans fotoğraftaki bant kalınlığı: ince ≈ halkanın %9'u, 30° ≈ %17'si.
    expect(at(1).len).toBe(13);
    expect(at(5).len).toBe(16);
    expect(at(10).len).toBe(19);
    expect(at(30).len).toBe(25);
    // Ana yön çizgisi (30°) ince çizgiden belirgin biçimde kalın.
    expect(at(30).w).toBeGreaterThan(at(1).w * 2);
    expect(at(10).w).toBeGreaterThan(at(1).w);
  });

  it('gives every degree a tick, so no degree is unlabelled on the ring', () => {
    const seen = new Set(TICKS.map((t) => t.angle));
    for (let d = 0; d < 360; d += 1) expect(seen.has(d)).toBe(true);
  });

  it('is symmetric about north', () => {
    const at = (a: number) => TICKS.find((t) => t.angle === a)!;
    expect(at(0).len).toBe(at(30).len);
    expect(at(90).len).toBe(at(270).len);
    expect(at(45).len).toBe(at(315).len);
  });
});

describe('directionName (app language)', () => {
  const tr = (k: string) => i18n.t(k, { lng: 'tr' });
  const en = (k: string) => i18n.t(k, { lng: 'en' });

  it('names the eight points in Turkish, not with Latin letters', () => {
    const cases: [number, string][] = [
      [0, 'Kuzey'],
      [20, 'Kuzey'],
      [45, 'Kuzeydoğu'],
      [60, 'Kuzeydoğu'],
      [90, 'Doğu'],
      [135, 'Güneydoğu'],
      [180, 'Güney'],
      [225, 'Güneybatı'],
      [270, 'Batı'],
      [315, 'Kuzeybatı'],
      [350, 'Kuzey'],
      [359, 'Kuzey'],
    ];
    for (const [deg, want] of cases) expect({ deg, got: directionName(deg, tr) }).toEqual({ deg, got: want });
  });

  it('follows the app language', () => {
    expect(directionName(0, en)).toBe('North');
    expect(directionName(0, tr)).toBe('Kuzey');
    expect(directionName(225, en)).toBe('South-West');
  });

  it('does not drift at the top of the dial (the old 22.5 degree bug)', () => {
    // Eski TR kısaltma tablosunda 225° -> "B" (Batı) idi; Batı 270°'dir.
    expect(directionIndex(225)).toBe(5);
    expect(directionName(225, tr)).toBe('Güneybatı');
    expect(directionName(270, tr)).toBe('Batı');
  });

  it('never returns an empty name for any whole degree', () => {
    for (let d = 0; d < 360; d += 1) expect(directionName(d, tr).length).toBeGreaterThan(0);
  });
});

describe('displayDegrees', () => {
  it('wraps back to 0 after 359 instead of showing 360', () => {
    // 360° ≡ 0°; ekranda "360°" görünmemeli.
    expect(displayDegrees(359)).toBe(359);
    expect(displayDegrees(359.4)).toBe(359);
    expect(displayDegrees(359.6)).toBe(0);
    expect(displayDegrees(359.9)).toBe(0);
    expect(displayDegrees(360)).toBe(0);
  });

  it('rounds the rest the way a compass does', () => {
    expect(displayDegrees(0)).toBe(0);
    expect(displayDegrees(0.4)).toBe(0);
    expect(displayDegrees(0.5)).toBe(1);
    expect(displayDegrees(122.4)).toBe(122);
    expect(displayDegrees(122.5)).toBe(123);
  });

  it('never leaves 0..359 for any input', () => {
    for (let d = 0; d < 360; d += 0.5) {
      const v = displayDegrees(d);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(359);
    }
  });
});
