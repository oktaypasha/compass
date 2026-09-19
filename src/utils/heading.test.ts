import {
  cardinalIndex,
  complementaryStep,
  emaAngleRead,
  emaAngleStep,
  createEmaState,
  headingFromMagnetometer,
  isDeviceLevel,
  normalizeAngle,
  shortestDelta,
  tiltCompensatedHeading,
  unwrapStep,
} from './heading';

describe('normalizeAngle', () => {
  it('wraps negatives and overflow', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-1)).toBeCloseTo(359);
    expect(normalizeAngle(721)).toBeCloseTo(1);
  });
});

describe('shortestDelta', () => {
  it('takes the short way across 0°', () => {
    expect(shortestDelta(359, 1)).toBeCloseTo(2);
    expect(shortestDelta(1, 359)).toBeCloseTo(-2);
    expect(shortestDelta(10, 350)).toBeCloseTo(-20);
    expect(shortestDelta(0, 180)).toBeCloseTo(-180);
  });
});

describe('headingFromMagnetometer', () => {
  it('reports the bearing of the phone top edge (flat)', () => {
    // Kuzey +Y'de (üst kenar önünde) → 0°; kuzey +X'te ise üst kenar batıya bakar → 270°.
    expect(headingFromMagnetometer(0, 1)).toBeCloseTo(0);
    expect(headingFromMagnetometer(-1, 0)).toBeCloseTo(90);
    expect(headingFromMagnetometer(0, -1)).toBeCloseTo(180);
    expect(headingFromMagnetometer(1, 0)).toBeCloseTo(270);
  });
});

describe('tiltCompensatedHeading', () => {
  it('equals flat heading when level', () => {
    // Kuzey telefon çerçevesinde KD yönünde → üst kenar 315° (KB) kerterizinde.
    const h = tiltCompensatedHeading({ x: 20, y: 20, z: -40 }, { x: 0, y: 0, z: 9.81 });
    expect(h).toBeCloseTo(315, 0);
  });

  it('stays invariant under 30° forward pitch (physically consistent pair)', () => {
    // Dünya: kuzey=+Y, B=(0,20,-40). X ekseni etrafında 30° öne eğilme:
    // a = R_x(30°)·(0,0,g), m = R_x(30°)·B. Üst kenar hâlâ kuzeyi gösterir → 0°.
    const level = tiltCompensatedHeading({ x: 0, y: 20, z: -40 }, { x: 0, y: 0, z: 9.81 });
    const pitched = tiltCompensatedHeading(
      { x: 0, y: 37.32, z: -24.64 },
      { x: 0, y: -4.9, z: 8.49 },
    );
    expect(level).toBeCloseTo(0, 0);
    expect(Math.abs(pitched - level)).toBeLessThan(8);
  });

  it('tracks 90° yaw while level (top edge points EAST)', () => {
    // Dünya kuzeyi=+Y. Telefon saat yönünde 90° döndü → üst kenar doğuda (+X).
    // Ölçülen m = R_z(+90°)·(0,20,-40) = (-20,0,-40).
    const h = tiltCompensatedHeading({ x: -20, y: 0, z: -40 }, { x: 0, y: 0, z: 9.81 });
    expect(h).toBeCloseTo(90, 0);
  });

  it('tracks 270° yaw while level (top edge points WEST, mirror guard)', () => {
    // Aynalanmış pusula burada 90° verir; doğru cevap 270°'dir.
    const h = tiltCompensatedHeading({ x: 20, y: 0, z: -40 }, { x: 0, y: 0, z: 9.81 });
    expect(h).toBeCloseTo(270, 0);
  });
});

describe('emaAngleStep (sin/cos space)', () => {
  it('does NOT swing the long way across 0°', () => {
    let st = createEmaState();
    st = emaAngleStep(st, 359, 0.2);
    for (let i = 0; i < 30; i++) {
      st = emaAngleStep(st, 1, 0.2);
    }
    const out = emaAngleRead(st);
    // Naif açı-ortalaması ~180° verirdi; doğru sonuç 1°'ye yakınsamalı.
    expect(Math.min(out, 360 - out)).toBeLessThan(10);
  });

  it('smooths jitter but converges', () => {
    let st = createEmaState();
    const noisy = [90, 92, 88, 91, 89, 90, 93, 87, 90, 90, 90, 90, 90, 90, 90];
    for (const n of noisy) st = emaAngleStep(st, n, 0.25);
    expect(emaAngleRead(st)).toBeCloseTo(90, 0);
  });
});

describe('complementaryStep', () => {
  it('follows gyro fast, corrects with magnetometer', () => {
    // 10°/sn dönüş, manyetometre aynı yönü söylüyor → sürüklenme yok.
    let fused = 0;
    for (let i = 0; i < 10; i++) {
      fused = complementaryStep(fused, 10, 0.1, fused + 1, 0.05);
    }
    expect(fused).toBeGreaterThan(5);
    expect(fused).toBeLessThan(15);
  });

  it('pulls drifted gyro back to magnetic north', () => {
    let fused = 30; // jiroskop sürüklenmiş
    for (let i = 0; i < 200; i++) {
      fused = complementaryStep(fused, 0, 0.02, 0, 0.05);
    }
    expect(Math.min(fused, 360 - fused)).toBeLessThan(2);
  });
});

describe('unwrapStep', () => {
  it('accumulates turns without wrapping the animated value', () => {
    expect(unwrapStep(359, 1)).toBeCloseTo(361);
    expect(unwrapStep(361, 359)).toBeCloseTo(359);
    expect(unwrapStep(0, 270)).toBeCloseTo(-90);
  });
});

describe('cardinalIndex', () => {
  it('maps 16-wind compass', () => {
    expect(cardinalIndex(0)).toBe(0);
    expect(cardinalIndex(90)).toBe(4);
    expect(cardinalIndex(180)).toBe(8);
    expect(cardinalIndex(270)).toBe(12);
    expect(cardinalIndex(359)).toBe(0);
  });
});

describe('isDeviceLevel', () => {
  it('detects flat vs shaken device', () => {
    expect(isDeviceLevel({ x: 0, y: 0, z: 9.81 })).toBe(true);
    expect(isDeviceLevel({ x: 8, y: 8, z: 8 })).toBe(false);
  });
});
