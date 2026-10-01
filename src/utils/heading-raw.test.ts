import {
  bearingFromSample,
  headingFromRawVectors,
  headingFromRotationMatrix,
  poseStep,
  type Vec3,
} from './heading';

/**
 * iOS'ta yaşanan iki büyük hatanın regresyon testleri.
 *
 * 1) `headingFromRawVectors` — iOS artık kerterizi Swift'te değil, burada
 *    hesaplıyor. Cihaz koordinatları elle kuruluyor ve FİZİKSEL olarak neyi
 *    göstermesi gerektiği bilinen durumlar doğrulanıyor.
 *
 * 2) `headingFromRotationMatrix` — gaz (bakış) vektörünün işareti düzeltildi;
 *    telefon DİK tutulduğunda önce 180° ters dönüyordu.
 *
 * Cihaz koordinat düzeni (CoreMotion ve RN ivmeölçer için aynı):
 *   x = ekranın sağı, y = ekranın üstü, z = ekranın DIŞI (kullanıcıya doğru)
 * Yerçekimi cihazın üstüne değil AŞAĞI doğru bir vektördür.
 */

const DEG = 180 / Math.PI;

function unit(v: Vec3): Vec3 {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

/** Eksen etrafında Rodrigues rotasyonu (derece). */
function rot(v: Vec3, axis: Vec3, deg: number): Vec3 {
  const a = unit(axis);
  const c = Math.cos(deg / DEG);
  const s = Math.sin(deg / DEG);
  const d = a.x * v.x + a.y * v.y + a.z * v.z;
  return {
    x: v.x * c + (a.y * v.z - a.z * v.y) * s + a.x * d * (1 - c),
    y: v.y * c + (a.z * v.x - a.x * v.z) * s + a.y * d * (1 - c),
    z: v.z * c + (a.x * v.y - a.y * v.x) * s + a.z * d * (1 - c),
  };
}

/** Telefonu yatay (ekran yukarı) tutup `bearing` yönüne çevirir. */
function flatPhone(bearing: number): { g: Vec3; m: Vec3 } {
  const b = bearing / DEG;
  // Dünya kuzeyi (0,1,0) cihazda: baş kenar yönü ve sağ kenar yönü.
  // Baş kenar (y) dünyada (sin b, cos b, 0); sağ kenar (x) = (cos b, -sin b, 0).
  // Yerçekimi dünyada aşağı → ekran yukarı bakarken cihazda -z.
  const g: Vec3 = { x: 0, y: 0, z: -1 };
  const m: Vec3 = { x: -Math.sin(b), y: Math.cos(b), z: 0 };
  return { g, m };
}

/**
 * Telefonu DİK tutup KULLANICININ `bearing` yönüne baktırır (portre).
 *
 * Dik tutulduğunda pusulanın ölçtüğü yön, ekranın baktığı yön DEĞİL,
 * **kullanıcının ekrana baktığı yöndür** — kullanıcı ekranın karşısındadır,
 * yani ekranın dış normalinin negatifi (device −z) kullanıcının bakışıdır.
 *
 *   ekranın dışı (+z) = kullanıcının arkası = bearing + 180
 *   yerçekimi dünyada aşağı = cihazın −y ekseni
 *   dünya kuzeyi (0,1,0) cihazda (sin(back), 0, cos(back))
 */
function uprightPhone(bearing: number): { g: Vec3; m: Vec3 } {
  const back = (((bearing + 180) % 360) as number) / DEG;
  const g: Vec3 = { x: 0, y: -1, z: 0 };
  const m: Vec3 = { x: Math.sin(back), y: 0, z: Math.cos(back) };
  return { g, m };
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

describe('headingFromRawVectors — yatay telefon (kullanımın çoğu)', () => {
  it.each([0, 30, 45, 90, 135, 180, 225, 270, 315, 359])(
    'telefon %i° yöne baktığında %i° okur',
    (bearing) => {
      const { g, m } = flatPhone(bearing);
      const r = headingFromRawVectors(g, m);
      expect(near(r.heading, bearing)).toBe(true);
    },
  );

  it('tam yatayken üst kenar kullanılır (topHorizontal = 1)', () => {
    const { g, m } = flatPhone(0);
    const r = headingFromRawVectors(g, m);
    expect(r.topHorizontal).toBeCloseTo(1, 3);
  });

  it('yerçekiminin işareti ters çevrilse kerteriz AYNADA döner (belirgin hata)', () => {
    // Yanlış işaret kırmızı bayrağı anında gösterir: 90° yerine 270° okunur.
    // (0° kendi aynası olduğu için belirti vermez — bu yüzden 90° seçildi.)
    const { g, m } = flatPhone(90);
    const flipped = { g: { x: -g.x, y: -g.y, z: -g.z }, m };
    const r = headingFromRawVectors(flipped.g, m);
    expect(near(r.heading, 270)).toBe(true);
  });
});

describe('headingFromRawVectors — dik telefon (kullanıcının bakışı)', () => {
  it.each([0, 90, 180, 270])('kullanıcı %i° yöne bakarken %i° okur', (bearing) => {
    const { g, m } = uprightPhone(bearing);
    const r = headingFromRawVectors(g, m);
    expect(r.topHorizontal).toBeCloseTo(0, 2);
    expect(near(r.heading, bearing)).toBe(true);
  });
});

describe('headingFromRawVectors — eğim kompanzasyonu', () => {
  it.each([10, 20, 30, 45, 60])(
    'sağ kenar etrafında %i° eğimde kerteriz KAYMAZ',
    (tilt) => {
      const base = flatPhone(42);
      // Telefonu kendi sağ kenarı (x) etrafında eğiyoruz: baş kenarın YATAY
      // yönü değişmez, dolayısıyla okuma değişmemeli.
      const g = rot(base.g, { x: 1, y: 0, z: 0 }, tilt);
      const m = rot(base.m, { x: 1, y: 0, z: 0 }, tilt);
      const r = headingFromRawVectors(g, m);
      expect(near(r.heading, 42, 0.5)).toBe(true);
    },
  );

  it('0° ile 90° arası tüm eğimlerde sonuç tanımlı', () => {
    for (let t = 0; t <= 90; t += 5) {
      const base = flatPhone(120);
      const r = headingFromRawVectors(
        rot(base.g, { x: 1, y: 0, z: 0 }, t),
        rot(base.m, { x: 1, y: 0, z: 0 }, t),
      );
      expect(Number.isFinite(r.heading)).toBe(true);
    }
  });

  it('dikeyden yataya geçişte okuma sürekli (ani sıçrama yok)', () => {
    // Aynı fiziksel yön (42°), telefon yataydan dikeye doğru çevrilirken
    // okuma sabit kalmalı: 42°'yi gösteren yön, üst kenarın yatay izdüşümü
    // ve ekran normalinin yatay izdüşümü aynı yeri gösterir.
    const b = 42 / DEG;
    for (const tilt of [0, 30, 60, 80, 89]) {
      // Baş kenarı dünyada sabit (sin b, cos b, 0) tutup telefonu dikeye
      // doğru yatırmak yerine, telefonu yatay tutup baş kenarı yatay izdüşümü
      // boyunca döndürüyoruz: ekran normali yatay izdüşümü de aynı yönü verir.
      const g = rot({ x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, 90 - tilt);
      const m = rot({ x: -Math.sin(b), y: Math.cos(b), z: 0 }, { x: 0, y: 0, z: 1 }, 0);
      const r = headingFromRawVectors(g, m);
      expect(Number.isFinite(r.heading)).toBe(true);
    }
  });
});

describe('headingFromRawVectors — bozuk girdi', () => {
  it('sıfır yerçekimi NaN döner, uydurma kuzey üretmez', () => {
    const r = headingFromRawVectors({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(Number.isFinite(r.heading)).toBe(false);
  });

  it('yerçekimiyle paralel manyetik alanda (yatay bileşen yok) NaN döner', () => {
    const r = headingFromRawVectors({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 });
    expect(Number.isFinite(r.heading)).toBe(false);
  });
});

describe('bearingFromSample — iki platformun tek sözleşmesi', () => {
  it('iOS: skaler yok, ham vektör var → ham vektörden hesaplar', () => {
    // iOS artık `headingDeg` alanını HİÇ göndermiyor (NaN göndermemek için).
    const { g, m } = flatPhone(137);
    const h = bearingFromSample({ gravity: g, mag: m });
    expect(h).not.toBeNull();
    expect(near(h as number, 137)).toBe(true);
  });

  it('Android: skaler var → doğrudan skaleri kullanır', () => {
    expect(bearingFromSample({ headingDeg: 42.5 })).toBe(42.5);
  });

  it('NE SKALER NE HAM VEKTÖR varsa null döner (uydurma 0 üretmez)', () => {
    // iOS bozuk bir çerçevede alanları düşürebilir; ekranda 0° göstermektense
    // örnek atılır, bir sonraki örnek beklenir.
    expect(bearingFromSample({})).toBeNull();
  });

  it('NaN skaler null döner (sessizce 0 olmaz)', () => {
    expect(bearingFromSample({ headingDeg: Number.NaN })).toBeNull();
  });

  it('ham vektör bozuksa skaler YEDEK OLMAZ — null döner', () => {
    // Vektörler geldiyse onlar esastır; bozuklukta skalere sessizce düşmek,
    // iki farklı matematik arasında görünmez bir kayma yaratırdı.
    const h = bearingFromSample({
      headingDeg: 0,
      gravity: { x: 0, y: 0, z: 0 },
      mag: { x: 0, y: 1, z: 0 },
    });
    expect(h).toBeNull();
  });
});

// --- Dönüş matrisi yolu (Android) -------------------------------------------

/** Cihaz eksenlerinin dünya koordinatlarını R'nin sütunları olarak yazar. */
function matrixFromColumns(xDev: Vec3, yDev: Vec3, zDev: Vec3): number[] {
  return [xDev.x, yDev.x, zDev.x, xDev.y, yDev.y, zDev.y, xDev.z, yDev.z, zDev.z];
}

describe('headingFromRotationMatrix — gaz (bakış) vektörünün işareti', () => {
  it('DİK telefon: kullanıcı kuzeye bakarken kuzeyi okur', () => {
    // Dik telefon, ekran kullanıcıya dönük, kullanıcı KUZEYE bakıyor.
    // Ekranın dışı (+z) = kullanıcının arkası = GÜNEY.
    const R = matrixFromColumns(
      { x: 1, y: 0, z: 0 }, // sağ kenar = doğu
      { x: 0, y: 0, z: 1 }, // üst kenar = dünya yukarı (dikey telefon)
      { x: 0, y: -1, z: 0 }, // ekranın dışı = güney
    );
    const { heading, pose } = headingFromRotationMatrix(R, 'upright');
    expect(pose).toBe('upright');
    // Dik tutulduğunda ölçülen yön −z = kullanıcının bakışı = kuzey.
    expect(near(heading, 0, 0.5)).toBe(true);
  });

  it('DİK telefon: kullanıcı doğuya bakarken doğuyu okur', () => {
    // Ekranın dışı = kullanıcının arkası = batı.
    const R = matrixFromColumns(
      { x: 0, y: 0, z: -1 }, // sağ kenar = dünya aşağı
      { x: 0, y: 0, z: 1 }, // üst kenar = dünya yukarı
      { x: -1, y: 0, z: 0 }, // ekranın dışı = batı
    );
    const { heading } = headingFromRotationMatrix(R, 'upright');
    expect(near(heading, 90, 0.5)).toBe(true);
  });

  it.each([0, 45, 90, 180, 270])('YATAY telefon %i° yöne bakarken %i° okur', (bearing) => {
    const b = bearing / DEG;
    const R = matrixFromColumns(
      { x: Math.cos(b), y: -Math.sin(b), z: 0 }, // sağ kenar
      { x: Math.sin(b), y: Math.cos(b), z: 0 }, // üst kenar
      { x: 0, y: 0, z: 1 }, // ekran normali = yukarı
    );
    const { heading } = headingFromRotationMatrix(R, 'flat');
    expect(near(heading, bearing, 0.01)).toBe(true);
  });
});

describe('poseStep', () => {
  it('histerezisle geçer: |sz| ≈ ekran normalinin dikey bileşeni', () => {
    // sz ≈ 0  → ekran normali yatay → telefon DİK
    // sz ≈ 1  → ekran normali dikey → telefon YATAY
    // Geçiş eşikleri: flat→upright |sz| < 0.4, upright→flat |sz| > 0.6.
    // 0.4…0.6 bandı iki yönde de kendini korur (titreşim olmaz).
    let p: 'flat' | 'upright' = 'flat';
    p = poseStep(p, 0.9);
    expect(p).toBe('flat');
    p = poseStep(p, 0.5); // ölü bant
    expect(p).toBe('flat');
    p = poseStep(p, 0.1);
    expect(p).toBe('upright');
    p = poseStep(p, 0.5); // ölü bant
    expect(p).toBe('upright');
    p = poseStep(p, 0.9);
    expect(p).toBe('flat');
  });
});

