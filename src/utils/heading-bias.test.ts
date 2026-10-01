import { headingFromRotationMatrix, normalizeAngle, type DevicePose } from './heading';

/**
 * "Bizim uygulamamız 0° derken iPhone 359° diyor" — 1° farkının matematiksel
 * bir hata mı yoksa gösterim/filtre farkı mı olduğunu ayırmak için.
 *
 * Yöntem: fiziksel olarak tutarlı bir dönüş matrisi üretip
 * `headingFromRotationMatrix`in gerçekten istenen başlığı döndürdüğünü
 * doğruluyoruz. Eğer projeksiyonda sabit bir ofset (bias) olsaydı, burada her
 * açıda aynı miktarda hata görünürdü.
 */
function flatMatrixFor(headingDeg: number): number[] {
  // Düz (yatay) telefon: cihazın ÜST KENARI yatayda `heading` yönünde.
  // Sözleşme: R row-major, dünya X = doğu, Y = kuzey, Z = yukarı ve
  // cihaz eksenleri R'nin SÜTUNLARIDIR. Üst kenar (sütun 1) = (sin h, cos h, 0).
  const h = (headingDeg * Math.PI) / 180;
  const s = Math.sin(h);
  const c = Math.cos(h);
  //   sütun 0 = sağ kenar  = ( cos h, -sin h, 0)
  //   sütun 1 = üst kenar  = ( sin h,  cos h, 0)
  //   sütun 2 = ekran norm = ( 0, 0, 1)
  return [
    c, s, 0, // satır x (east)
    -s, c, 0, // satır y (north)
    0, 0, 1, // satır z (up)
  ];
}

const flat: DevicePose = 'flat';

describe('projeksiyonda sabit ofset yok', () => {
  it.each([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330])(
    'yatay telefon %i° verildiğinde tam aynı dereceyi döndürür',
    (deg) => {
      const { heading } = headingFromRotationMatrix(flatMatrixFor(deg), flat);
      // 1e-6 tolerans: yuvarlama hatası değil, gerçek sapma arıyoruz.
      expect(Math.abs(heading - deg)).toBeLessThan(1e-6);
    },
  );

  it('kuzey sınırında 359.6° girdi yuvarlanınca 360 verir (ekranda 0 olur)', () => {
    // Bu, "biz 0 diyoruz, iPhone 359 diyor" belirtisinin EN OLASI açıklaması:
    // fiziksel değerler 1°'den az farklı, fark sadece TAMSİYA KURALINDA.
    const { heading } = headingFromRotationMatrix(flatMatrixFor(359.6), flat);
    expect(heading).toBeCloseTo(359.6, 6);
    // Ekranın yaptığı yuvarlama:
    expect(Math.round(heading)).toBe(360);
  });

  it('her açıda hata aynı işarette değil → sistematik ofset yok', () => {
    const errors = [0, 45, 90, 135, 180, 225, 270, 315].map(
      (d) => headingFromRotationMatrix(flatMatrixFor(d), flat).heading - d,
    );
    // Sabit bir ofset olsaydı hepsi aynı (veya aynı mutlak değerde) olurdu.
    expect(new Set(errors.map((e) => e.toFixed(6))).size).toBe(1);
    expect(Math.abs(errors[0] ?? 99)).toBeLessThan(1e-6);
  });
});

describe('normalizeAngle', () => {
  it('0..360 aralığında tutar', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-0.5)).toBeCloseTo(359.5, 6);
    expect(normalizeAngle(725)).toBeCloseTo(5, 6);
  });
});
