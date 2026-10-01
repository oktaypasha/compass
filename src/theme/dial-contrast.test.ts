import { colorsFor } from './theme-provider';
import { DIAL_GEOMETRY } from '../components/compass-dial';

const { tickOuter, numeral, cardinal, center, cross, indexOuter } = DIAL_GEOMETRY;

/**
 * Kadran kontrastı — kullanıcı geri bildiriminden gelen regresyon testleri.
 *
 * Şikâyet (Samsung, her iki tema): "kadran renkleri arka plan içinde yutuluyor,
 * sönük kaldı, zor seçiliyor."
 *
 * Kök neden: taksimat, derece rakamları, N/E/S/W ve indeks çizgisi
 * `colors.separator` ile çiziliyordu. Açık temada `#c6c6c8` beyaz zemin
 * üzerinde ~1.7:1 kontrast verir — pratikte görünmez. Koyu temada `#38383a`
 * siyah zeminde daha da kötü.
 *
 * Sözleşme: kadran mürekkebi TAM siyah / TAM beyaz olmalı.
 */

/** `#rrggbb` → `[r, g, b]`. */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** WCAG bağılımlı oran. 1 = aynı renk, 21 = siyah/beyaz. */
function contrast(a: string, b: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const l1 = lum(a);
  const l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe('kadran mürekkebi arka planla yutmaz', () => {
  const light = colorsFor('light');
  const dark = colorsFor('dark');

  it('açık temada kadran mürekkebi TAM SİYAH', () => {
    expect(light.dialInk).toBe('#000000');
  });

  it('koyu temada kadran mürekkebi TAM BEYAZ (metalik beyaz)', () => {
    expect(dark.dialInk).toBe('#ffffff');
  });

  it('her iki temada da zemine karşı yüksek kontrast (≥ 7:1)', () => {
    // 7:1 = WCAG AAA ve "her yerden okunur" eşiği. Taksimat 0.8 px ince
    // çizgi olduğu için asgari değer bu olmalı.
    expect(contrast(light.dialInk, light.systemBackground)).toBeGreaterThanOrEqual(7);
    expect(contrast(dark.dialInk, dark.systemBackground)).toBeGreaterThanOrEqual(7);
  });

  it('ESKİ davranış testte kırılır (regresyon kanıtı)', () => {
    // `separator` ile çizim düşseydi kontrast bu değere düşerdi — şikâyetin
    // sayısal karşılığı. Test, düzeltmenin gerçekten işe yaradığını gösterir.
    expect(contrast(light.separator, light.systemBackground)).toBeLessThan(2);
  });

  it('ikincil çizgiler (su terazisi çaprazı) de okunur (≥ 3:1)', () => {
    expect(contrast(light.dialInkDim, light.systemBackground)).toBeGreaterThanOrEqual(3);
    expect(contrast(dark.dialInkDim, dark.systemBackground)).toBeGreaterThanOrEqual(3);
  });

  it('merkez tablası zeminden ayırt edilir (≥ 1.15:1)', () => {
    // Tam ayrım gerekmez — tabla ince bir zemindir, ayırt edilebilir olması yeter.
    expect(contrast(light.dialPlate, light.systemBackground)).toBeGreaterThanOrEqual(1.15);
    expect(contrast(dark.dialPlate, dark.systemBackground)).toBeGreaterThanOrEqual(1.15);
  });
});

describe('kadran renkleri tema dışında sabit değildir', () => {
  it('kadran tokenları her iki temada FARKLIDIR', () => {
    // Tek renk (ör. her temada gri) kullanılsaydı birinde zor okunurdu.
    const light = colorsFor('light');
    const dark = colorsFor('dark');
    expect(light.dialInk).not.toBe(dark.dialInk);
    expect(light.dialPlate).not.toBe(dark.dialPlate);
  });

  it('tema değişince tokenlar gerçekten değişir (sabit palet değil)', () => {
    expect(colorsFor('light').dialInk).not.toBe(colorsFor('dark').dialInk);
  });
});

describe('kadran geometri değişmedi (renk değişikliği ölçü bozmaz)', () => {
  it('taksimat halkası, rakam ve indeks yarıçapları aynı', () => {
    // Kontrast değişikliği geometriyi kaydırmamalı: kullanıcı referansı sabit.
    expect(tickOuter).toBe(150);
    expect(numeral).toBe(186);
    expect(cardinal).toBe(112);
    expect(center).toBe(42);
    expect(cross).toBe(84);
    expect(indexOuter).toBe(180);
    // Tüm yarıçaplar 200'den küçük olmalı (viewBox kırpma koruması).
    for (const r of [tickOuter, numeral, cardinal, center, cross, indexOuter]) {
      expect(r).toBeLessThan(200);
    }
  });
});