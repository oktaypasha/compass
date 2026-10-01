import { i18n } from '../i18n';
import { displayDegrees, directionName, isLevelReading } from '../utils/heading';

/**
 * Su terazisi göstergesinin değişmez kuralı: **yeşil = merkezde**.
 *
 * Canlıda iki ayrı rapor geldi:
 * - "yeşil artı işareti başka yerde iken yeşele dönüyor"
 * - "serbest artı ile büyük artı üst üste çakışmalı, yeşil artı yanlış yerde duruyor"
 *
 * Sebep: `isLevelReading` ±2,5° tolerans tanıyor. 2° eğimli telefon "düz"
 * sayılıyor, gösterge yeşile dönüyor ama `bubbleX/Y` hâlâ kaymış duruyordu.
 * Gösterge artık düz kabul edildiğinde merkeze kilitleniyor.
 */
function levelOffset(level: boolean, x: number, y: number): { dx: number; dy: number } {
  return { dx: level ? 0 : x, dy: level ? 0 : y };
}

describe('su terazisi göstergesi kuralı', () => {
  it('yeşil (düz) kabul edildiğinde gösterge tam merkezde durur', () => {
    // isLevelReading 2° eğimi "düz" sayar:
    expect(isLevelReading(2, 0)).toBe(true);
    // ...ama gösterge yine de merkezde olmalı.
    expect(levelOffset(true, 0.31, -0.18)).toEqual({ dx: 0, dy: 0 });
  });

  it('kırmızı (eğik) durumda kayma korunur', () => {
    expect(isLevelReading(8, 0)).toBe(false);
    expect(levelOffset(false, 0.31, -0.18)).toEqual({ dx: 0.31, dy: -0.18 });
  });

  it('kayma tablonun yarıçapını aşmaz (bileşendeki travel ile)', () => {
    // Bileşen: dx = dx * travel, travel = R_CENTER * 0.5 * k
    const travel = 0.5;
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      expect(Math.abs(levelOffset(false, v, 0).dx * travel)).toBeLessThanOrEqual(travel);
    }
  });
});

describe('derece okuması', () => {
  it('sarmalanır: 359 dereceden sonra 0', () => {
    expect(displayDegrees(359)).toBe(359);
    expect(displayDegrees(359.6)).toBe(0);
  });
});

describe('yön adı', () => {
  it('app dilinde yazılır', async () => {
    await i18n.changeLanguage('tr');
    expect(directionName(316, (k: string) => i18n.t(k))).toBe('Kuzeybatı');
    await i18n.changeLanguage('en');
    expect(directionName(316, (k: string) => i18n.t(k))).toBe('North-West');
  });
});
