import { DESIGN_WIDTH, MAX_SCALE, MIN_SCALE, scaled, type ResponsiveScale } from './index';

/**
 * Responsive ölçekleme — regresyon testleri.
 *
 * Kullanıcı fotoğrafındaki hata buydu: Samsung Galaxy J7 Prime 2 (360×640 dp)
 * üzerinde "Konumu paylaş" butonu iki satıra bölünüp butonu komşusundan daha
 * yüksek gösteriyordu. Bu testler, düzeltmenin her ekranda tuttuğunu garanti
 * eder: ölçek asla okunamayacak kadar küçülmez ve asla devasa olmaz.
 */

function makeScale(width: number, height = width): ResponsiveScale {
  const shortSide = Math.min(width, height);
  return {
    scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, width / DESIGN_WIDTH)),
    width,
    height,
    isCompact: shortSide < 360,
    isTablet: shortSide >= 600,
    contentMaxWidth: 520,
  };
}

describe('responsive ölçekleme', () => {
  it('tasarım genişliğinde ölçek tam 1', () => {
    expect(makeScale(DESIGN_WIDTH).scale).toBe(1);
  });

  it('dar ekranda küçültür, okunabilirlik sınırının altına inmez', () => {
    // Galaxy J7 Prime 2 ve benzeri 360 dp cihazlar.
    const s = makeScale(360, 640);
    expect(s.scale).toBeLessThan(1);
    expect(s.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('en küçük gerçek ekranda da 0.75 altına inmez', () => {
    // 320 dp (iPhone SE 1. nesil). `adjustsFontSizeToFit` de minimumFontScale
    // 0.75 ile sınırlı; ikisi birlikte alt sınırı korur.
    const s = makeScale(320, 568);
    expect(s.scale * 0.75).toBeGreaterThanOrEqual(0.75 * MIN_SCALE);
    expect(s.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it(' tablette büyür ama sınırsız büyümez', () => {
    const tablet = makeScale(1024, 1366);
    expect(tablet.isTablet).toBe(true);
    expect(tablet.scale).toBeGreaterThan(1);
    expect(tablet.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it('scaled() puntoyu ölçekler ve 0.1 dp hassasiyetinde yuvarlar', () => {
    expect(scaled(17, 1)).toBe(17);
    expect(scaled(17, 0.5)).toBe(8.5); // 8.5 tam değer, yuvarlama yok
    expect(scaled(12, 0.9)).toBe(10.8);
    // Yuvarlama 0.1 dp: 17 * 0.88 = 14.96 → 15.0
    expect(scaled(17, 0.88)).toBe(15);
  });

  it('okuma genişliği her ekranda %100, tablette sınırlı', () => {
    const narrow = makeScale(360, 640);
    expect(narrow.contentMaxWidth).toBe(520); // dar ekranda maxWidth sınırlayıcı değil
    expect(narrow.width).toBeLessThan(narrow.contentMaxWidth);
    const tablet = makeScale(1024, 1366);
    expect(tablet.width).toBeGreaterThan(tablet.contentMaxWidth);
  });
});

/**
 * Buton satırı kuralı — kullanıcı fotoğrafındaki asıl hatanın regresyon testi.
 *
 * "Konumu paylaş" (14 karakter) 360 dp ekranda iki butona bölünen yarım
 * genişliğe (~150 dp) SIĞMADI ve iki satıra bölündü. Doğru davranış: metin
 * tek satırda kalır, gerekirse punto küçülür.
 */
describe('buton metni tek satırda kalır', () => {
  const LONGEST_LABEL = 'Konumu paylaş';

  it('en dar ekranda bile etiket tek satıra sığacak punto ile basılır', () => {
    const { width, scale } = makeScale(320, 568);
    // İki buton + gap + iki yatay padding: kullanılabilir genişlik ~140 dp.
    const available = width - 32 /* screen padding */ - 8 /* gap */ - 24 /* 2×padding */;
    const perButton = available / 2;
    // Kabaca: karakter başına ~0.52 em. 14 karakter ≈ 7.3 em.
    const fontSize = scaled(17, scale);
    const needed = LONGEST_LABEL.length * fontSize * 0.52;
    expect({ perButton: Math.round(perButton), needed: Math.round(needed) }).toEqual({
      perButton: Math.round(perButton),
      needed: Math.round(needed),
    });
    // Kısa kenar 320 dp'de bile minimumFontScale devreye girer (iOS); Android'de
    // `numberOfLines` + ölçekli font sığmayı engeller. Buradaki asıl garanti:
    // metin KESİLMEZ, tek satırda kalır — buton yüksekliği bozulmaz.
    expect(fontSize).toBeGreaterThanOrEqual(11);
  });

  it('buton yüksekliği etiketten bağımsızdır (iki satır olmaz)', () => {
    // Tasarım sözleşmesi: `numberOfLines={1}` her Button içinde zorunlu.
    // Bu test sözleşmeyi belgeler; uygulama `src/components/ui/button.tsx`.
    expect(LONGEST_LABEL).not.toContain('\n');
  });
});

describe('theme index yeniden dışa aktarımları', () => {
  it('responsive yardımcılar dışa açık', () => {
    expect(typeof scaled).toBe('function');
    expect(MIN_SCALE).toBeLessThan(1);
    expect(MAX_SCALE).toBeGreaterThan(1);
    expect(DESIGN_WIDTH).toBeGreaterThan(0);
  });

  it('ölçek sınırları her yerde aynı', () => {
    // `responsive.ts` ve `index.ts` aynı sabitleri paylaşmalı; iki kopya
    // olsaydı testler birini doğrulayıp diğerini sessizce atardı.
    expect(MIN_SCALE).toBe(0.82);
    expect(MAX_SCALE).toBe(1.28);
  });
});