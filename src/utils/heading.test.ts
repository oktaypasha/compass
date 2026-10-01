import {
  applyDeclination,
  applyUserOffset,
  cardinalIndex,
  classifyFieldStrength,
  clampUserOffset,
  complementaryStep,
  crossedNorth,
  emaAngleRead,
  emaAngleStep,
  createEmaState,
  headingFromMagnetometer,
  headingFromRotationMatrix,
  isDeviceLevel,
  isLevelReading,
  levelFromAccel,
  normalizeAngle,
  poseStep,
  shortestDelta,
  tiltCompensatedHeading,
  unwrapStep,
  USER_OFFSET_LIMIT_DEG,
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

describe('applyDeclination', () => {
  it('adds east-positive declination and wraps', () => {
    expect(applyDeclination(320, 6)).toBeCloseTo(326);
    expect(applyDeclination(357, 6)).toBeCloseTo(3);
    expect(applyDeclination(10, -4)).toBeCloseTo(6);
  });
});

describe('classifyFieldStrength', () => {
  it('accepts the normal earth band', () => {
    expect(classifyFieldStrength(48, 'normal')).toBe('normal');
    expect(classifyFieldStrength(30, 'normal')).toBe('normal');
    expect(classifyFieldStrength(60, 'normal')).toBe('normal');
  });

  it('flags suspect and interference bands', () => {
    expect(classifyFieldStrength(22, 'normal')).toBe('suspect');
    expect(classifyFieldStrength(70, 'normal')).toBe('suspect');
    expect(classifyFieldStrength(15, 'normal')).toBe('interference');
    expect(classifyFieldStrength(120, 'suspect')).toBe('interference');
  });

  it('uses hysteresis: does not flicker at the boundary', () => {
    // Parazite girildi; 24 µT hâlâ çıkış bandında değil → uyarı sürer.
    expect(classifyFieldStrength(24, 'interference')).toBe('interference');
    // 30 µT çıkış bandında → normale döner.
    expect(classifyFieldStrength(30, 'interference')).toBe('normal');
    // Şüpheli bantta 24 µT → suspect sürer, parazite düşmez.
    expect(classifyFieldStrength(24, 'suspect')).toBe('suspect');
  });

  it('keeps previous state on invalid input', () => {
    expect(classifyFieldStrength(Number.NaN, 'normal')).toBe('normal');
  });
});

describe('levelFromAccel', () => {
  it('reads zero tilt when flat', () => {
    const l = levelFromAccel({ x: 0, y: 0, z: 9.81 });
    expect(l.pitchDeg).toBeCloseTo(0);
    expect(l.rollDeg).toBeCloseTo(0);
    expect(l.bubbleX).toBeCloseTo(0);
    expect(l.bubbleY).toBeCloseTo(0);
  });

  it('reads right-roll and saturates the bubble at ±25°', () => {
    // 20° sağa yatış: ax = g·sin20 ≈ 3.35, az = g·cos20 ≈ 9.22.
    const l = levelFromAccel({ x: 3.35, y: 0, z: 9.22 });
    expect(l.rollDeg).toBeCloseTo(20, 0);
    expect(l.bubbleX).toBeCloseTo(0.8, 1);
    // 40° yatış baloncuğu doyurur.
    const sat = levelFromAccel({ x: 6.3, y: 0, z: 7.51 });
    expect(Math.abs(sat.bubbleX)).toBe(1);
  });
});

describe('crossedNorth', () => {
  it('fires only on full-turn boundary crossings', () => {
    expect(crossedNorth(359.7, 360.2)).toBe(true);
    expect(crossedNorth(-0.2, 0.3)).toBe(true);
    expect(crossedNorth(10, 20)).toBe(false);
    expect(crossedNorth(350, 355)).toBe(false);
  });
});

describe('poseStep', () => {
  it('switches with hysteresis, never flaps at the boundary', () => {
    expect(poseStep('flat', 0.2)).toBe('upright');
    expect(poseStep('flat', 0.5)).toBe('flat');
    expect(poseStep('upright', 0.5)).toBe('upright');
    expect(poseStep('upright', 0.7)).toBe('flat');
  });
});

describe('headingFromRotationMatrix', () => {
  /**
   * Fiziksel tutarlı matris üretici: cihaz eksenleri R'nin SÜTUNLARIDIR.
   * yaw φ (üst kenarın düz kerterizi) + pitch θ (üst kenarın yükselmesi).
   *   sütun0 (sağ kenar)  = (1,0,0)
   *   sütun1 (üst kenar)  = (sinφ·cosθ, cosφ·cosθ, sinθ)
   *   sütun2 (ekran norm.)= (−sinφ·sinθ, cosφ·sinθ, cosθ)
   */
  const matrix = (yawDeg: number, pitchDeg: number): number[] => {
    const p = (yawDeg * Math.PI) / 180;
    const t = (pitchDeg * Math.PI) / 180;
    const sp = Math.sin(p);
    const cp = Math.cos(p);
    const st = Math.sin(t);
    const ct = Math.cos(t);
    return [
      1, sp * ct, -sp * st,
      0, cp * ct, cp * st,
      0, st, ct,
    ];
  };

  it('reads flat yaw from the top edge (mirror-asymmetric pair)', () => {
    // Düz, üst kenar kuzeyde: R = I → 0°.
    expect(headingFromRotationMatrix([1, 0, 0, 0, 1, 0, 0, 0, 1], 'flat').heading).toBeCloseTo(0);
    // Düz, saat yönünde 90°: üst kenar doğuda → 90° (ayna 270° verirdi).
    const east = headingFromRotationMatrix([0, 1, 0, -1, 0, 0, 0, 0, 1], 'flat');
    expect(east.heading).toBeCloseTo(90);
    expect(east.pose).toBe('flat');
    // Düz, 270°: üst kenar batıda → 270°.
    expect(
      headingFromRotationMatrix([0, -1, 0, 1, 0, 0, 0, 0, 1], 'flat').heading,
    ).toBeCloseTo(270);
  });

  it('reads gaze direction when upright (portrait)', () => {
    // Dik portre, kuzeye bakış: ekran normali güneye → 0°.
    const n = headingFromRotationMatrix([1, 0, 0, 0, 0, -1, 0, 1, 0], 'flat');
    expect(n.pose).toBe('upright');
    expect(n.heading).toBeCloseTo(0);
    // Dik portre, doğuya bakış: ekran normali batıya → 90°.
    expect(
      headingFromRotationMatrix([0, 0, -1, -1, 0, 0, 0, 1, 0], 'upright').heading,
    ).toBeCloseTo(90);
  });

  it('holds the tilt-compensated reading across the whole usable tilt range', () => {
    // v2 regresyonu: |R[8]|<0.4 (θ>66°) altında bakışa ANALTILIRDI ve okuma
    // ~90° kayıyordu ("telefonu döndürünce kadran alakasız yerde duruyor").
    // v3: 0–75° eğimde okuma BİREBİR düz kerteriz (ölçülen en büyük adım 0.0000°).
    for (const yaw of [0, 45, 90, 200, 330]) {
      const flat = headingFromRotationMatrix(matrix(yaw, 0), 'flat').heading;
      for (let pitch = 0; pitch <= 75; pitch += 1) {
        const h = headingFromRotationMatrix(matrix(yaw, pitch), 'flat').heading;
        expect(Math.abs(shortestDelta(flat, h))).toBeLessThan(0.01);
      }
    }
  });

  it('ignores the previous pose in the math (v2 hysteresis is display-only)', () => {
    // Aynı matris, iki farklı önceki poz: v2'de 90° fark ederdi.
    for (let pitch = 0; pitch <= 75; pitch += 5) {
      const a = headingFromRotationMatrix(matrix(45, pitch), 'flat').heading;
      const b = headingFromRotationMatrix(matrix(45, pitch), 'upright').heading;
      expect(a).toBeCloseTo(b);
    }
  });

  it('hands over to the gaze convention only when the top edge dies', () => {
    // Üst kenar dikey (90° eğim) → saf bakış sözleşmesi.
    // yaw=45: üst kenarın düz kerterizi 45°, ekranın baktığı yön 135°.
    expect(headingFromRotationMatrix(matrix(45, 90), 'flat').heading).toBeCloseTo(135);
    // yaw=90'da iki sözleşme örtüşür → okuma hep 90° kalır.
    for (let pitch = 0; pitch <= 90; pitch += 5) {
      expect(headingFromRotationMatrix(matrix(90, pitch), 'flat').heading).toBeCloseTo(90);
    }
  });

  it('never flips sign when the two conventions are antiparallel (yaw 0)', () => {
    // Üst kenar tam kuzeyde: iki sözleşme antiparalel. Geniş harman bandı
    // burada 180° sıçrama yapıyordu; dar bant onu 78° bandına kadar öteler.
    for (let pitch = 0; pitch <= 75; pitch += 1) {
      expect(headingFromRotationMatrix(matrix(0, pitch), 'flat').heading).toBeCloseTo(0);
    }
  });
});

describe('applyUserOffset / clampUserOffset', () => {
  it('shifts the magnetic heading and wraps', () => {
    expect(applyUserOffset(350, 7)).toBeCloseTo(357);
    expect(applyUserOffset(5, -7)).toBeCloseTo(358);
    expect(applyUserOffset(180, 0)).toBeCloseTo(180);
  });

  it('clamps to the supported range', () => {
    expect(applyUserOffset(0, 999)).toBeCloseTo(USER_OFFSET_LIMIT_DEG);
    // Çıktı daima [0,360) sarılmış açıdır: −20° → 340°.
    expect(applyUserOffset(0, -999)).toBeCloseTo(360 - USER_OFFSET_LIMIT_DEG);
    expect(clampUserOffset(3.4)).toBe(3);
    expect(clampUserOffset(Number.NaN)).toBe(0);
    expect(clampUserOffset(1e9)).toBe(USER_OFFSET_LIMIT_DEG);
  });

  it('composes with declination in the documented order (offset → declination)', () => {
    const mag = 344;
    const biased = applyUserOffset(mag, 7);
    expect(applyDeclination(biased, 6)).toBeCloseTo(357);
  });

  it('makes magnetic → true visibly different (regression: toggle did nothing)', () => {
    // Kullanıcı raporu: "Gerçek"e basınca kadran hiç oynamıyordu. Sapma
    // uygulanmadığında iki mod BİREBİR aynı okumayı vermeli — test bunu
    // tersine çevirir: doğu-pozitif sapma okumayı doğuya kaydırır.
    const mag = 25;
    const magnetic = mag;
    const trueNorth = applyDeclination(mag, 6);
    expect(trueNorth).toBeCloseTo(31);
    expect(trueNorth).not.toBeCloseTo(magnetic);
    // Batı-pozitif sapma batıya kaydırır (işaret yönü testi).
    expect(applyDeclination(25, -6)).toBeCloseTo(19);
    // Sarma sınırında da fark korunur (350 + 6 = 356, 355 + 6 = 1).
    expect(applyDeclination(355, 6)).toBeCloseTo(1);
    expect(Math.abs(applyDeclination(355, 6) - 355)).toBeGreaterThan(5);
  });
});

describe('isLevelReading', () => {
  it('accepts small tilt, rejects visible tilt', () => {
    expect(isLevelReading(1, 1)).toBe(true);
    expect(isLevelReading(0, 0)).toBe(true);
    expect(isLevelReading(3, 0)).toBe(false);
    expect(isLevelReading(0, -5)).toBe(false);
  });
});
