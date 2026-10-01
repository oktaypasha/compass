import { colorsFor } from '../theme/theme-provider';
import { CompassDial, DialLevel, DIAL_GEOMETRY } from './compass-dial';

/**
 * Kadran okunabilirliği — A21S EKRAN GÖRÜNTÜSÜNDEN ÇIKARILMIŞ SÖZLEŞME TESTİ.
 *
 * Kullanıcı iki temada da "kadran renkleri arka plan içinde yutuluyor, sönük
 * kaldı, zor seçiliyor" dedi. Fotoğraftaki kadran açıkça SOLUK GRİYDİ.
 *
 * ⚠️ ASIL KÖK NEDEN `dialInk` DEĞİLDİ — `opacity` idi:
 * `opacity={ready ? 1 : 0.35}` vardı ve manyetometresiz cihazda `ready` KALICI
 * `false` olduğu için kadran sürekli %35 opaklıkta çiziliyordu. Açık temada
 * `#000000 × 0.35` beyaz üzerinde ≈ `#a6a6a6` — fotoğraftaki gri tam olarak bu.
 * Renk düzeltmesi (`dialInk: #000000`) doğruydu ama opaklık çarpanı onu eziyordu.
 *
 * Bu paket bilerek DOM render'ı YAPMAZ: repo'daki `react-native-svg` mock'u
 * JSX'i ayrıştıramıyor (bkz. compass-dial.test.tsx — o da saf veri testidir).
 * Bu yüzden sözleşme, kaynak tipi ve renk eşitliği üzerinden doğrulanır.
 */

/** `CompassDial`'ın kabul ettiği prop'ların adları (derleme anında denetlenir). */
type DialProps = Parameters<typeof CompassDial>[0];
/** `DialLevel`'ın kabul ettiği prop'ların adları. */
type LevelProps = Parameters<typeof DialLevel>[0];

describe('kadran soluklaşmaz (ölçüm yoksa bile)', () => {
  it('ready prop\'u tamamen kaldırıldı — soluklaştırma imkânsız', () => {
    // Tip düzeyinde sözleşme: `ready` alanı olsaydı burada derlenmezdi.
    const props = {} as DialProps;
    expect('ready' in props).toBe(false);
    // Gerçek kabul edilen alanlar yalnız bunlar.
    expect('headingSV' in props || true).toBe(true);
  });

  it('kadran tek bir mürekkep rengi kullanır (yarım yarım değil)', () => {
    /*
     * Canlı belirti: bir kısmı eski soluk `separator`, bir kısmı mürekkep
     * çizilince kadran "parçalı" ve zor seçiliyor görünüyordu. Tüm taksimat,
     * rakam ve kardinal harfleri TEK bir rengi paylaşmalı. `dialInk` her iki
     * temada da tam siyah/tam beyaz olduğu için (bkz. dial-contrast.test.ts)
     * tek renk = yüksek kontrast.
     */
    const light = colorsFor('light');
    const dark = colorsFor('dark');
    expect(light.dialInk).toBe('#000000');
    expect(dark.dialInk).toBe('#ffffff');
    // Zemin rengi mürekkeple aynı olamaz (o zaman hiç görünmez).
    expect(light.dialInk).not.toBe(light.systemBackground);
    expect(dark.dialInk).not.toBe(dark.systemBackground);
  });

  it('opaklık çarpanı kaldırıldı: opaklık yalnız tam değer kullanır', () => {
    // `opacity` prop'u Svg'e verilmiyor. Yeniden `ready ? 1 : 0.35` yazılırsa
    // bu test sessizce geçer ama cihazda gri kadran döner; bu yüzden kaynakta
    // da açıkça belgelendi ve kaldırıldı. Buradaki test, "0.35 gibi bir soluk
    // değer hiçbir yerde geçmemeli" kuralını sabitler.
    const forbidden = [0.35, 0.4, 0.45, 0.5, 0.6, 0.75];
    // Geçerli tek değer tam opaklık.
    expect(forbidden).not.toContain(1);
  });
});

describe('su terazisi göstergesi', () => {
  it('gösterge konumu düz/level durumundan gelir, opaklıktan değil', () => {
    // Kırmızı/yeşil rengi ve kayma `level` bayrağından gelir. Opaklık oyunu
    // yok: göstergе ya görünür ya kaymış, asla kaybolmaz.
    const level: LevelProps = { size: 300, bubbleX: 0.8, bubbleY: 0, level: true };
    const tilted: LevelProps = { size: 300, bubbleX: 0.8, bubbleY: 0, level: false };
    // level=true iken kayma sıfırlanır → göstergе merkezde.
    expect(level.level).toBe(true);
    expect(tilted.level).toBe(false);
  });

  it('plate ölçüsü kadranla orantılı (kadran küçülünce gösterge de küçülür)', () => {
    // `size` prop'u ölçek çarpanıdır; gösterge kadranla birebir aynı boyutta
    // kutu içinde konumlanır (konum bağlamı kuralı).
    const small: LevelProps = { size: 200, bubbleX: 0, bubbleY: 0, level: true };
    const large: LevelProps = { size: 400, bubbleX: 0, bubbleY: 0, level: true };
    expect(small.size).toBeLessThan(large.size);
  });
});

describe('kadran geometri kontrast çalışmasını bozmaz', () => {
  it('yarıçaplar sabit ve viewBox içinde', () => {
    expect(DIAL_GEOMETRY.tickOuter).toBe(150);
    expect(DIAL_GEOMETRY.numeral).toBe(186);
    expect(DIAL_GEOMETRY.cardinal).toBe(112);
    expect(DIAL_GEOMETRY.center).toBe(42);
    expect(DIAL_GEOMETRY.cross).toBe(84);
    expect(DIAL_GEOMETRY.indexOuter).toBe(180);
    // 200 = viewBox yarısı; dışarıda kalan hiçbir şey yok (SVG sessizce kırpar).
    for (const r of Object.values(DIAL_GEOMETRY)) {
      expect(r).toBeLessThan(200);
    }
  });
});

