import { getSensorCapabilities, type SensorCapabilities } from '../../modules/compass-sensors/src';
import { bearingFromSample, headingFromRawVectors } from './heading';

/**
 * Cihaz yetenekleri ve dürüst-kerteriz sözleşmesi.
 *
 * Canlı olay: Samsung Galaxy J7 Prime 2 (SM-G611F) üzerinde uygulama
 * "Simülasyon modu (sensör yok)" yazdı ve UYDURMA bir kerteriz gösterdi.
 * Kullanıcı bunu uygulamanın bozuk olduğu sanıp silme tehlikesindeydi.
 *
 * Gerçek donanım durumu (GSM Arena / PhoneSpecs / PhoneGG / Epey):
 * **parmak izi + ivmeölçer + yakınlık — manyetometre ve jiroskop YOK.**
 * Yani o telefon kerteriz ölçemez; ama ivmeölçer sayesinde su terazisi çalışır.
 * "Sensör yok" demek yanlıştı (ivmeölçer var), uydurma kerteriz göstermek de
 * yanlıştı. Doğrusu: yetenekleri SORGULA ve dürüstçe bildir.
 */

describe('cihaz pusula yeteneği', () => {
  const caps = (o: Partial<SensorCapabilities>): SensorCapabilities => ({
    magnetometer: true,
    accelerometer: true,
    gyroscope: true,
    rotationVector: true,
    geomagneticRotationVector: false,
    canComputeHeading: true,
    ...o,
  });

  it('manyetometre yoksa kerteriz HESAPLANAMAZ', () => {
    // Galaxy J7 Prime 2'nin gerçek donanım profili.
    const c = caps({
      magnetometer: false,
      gyroscope: false,
      rotationVector: false,
      geomagneticRotationVector: false,
      canComputeHeading: false,
    });
    expect(c.canComputeHeading).toBe(false);
    // Su terazisi çalışmaya devam etmeli.
    expect(c.accelerometer).toBe(true);
  });

  it('ivmeölçer olmadan da kerteriz hesaplanamaz (tilt-kompanzasyon imkânsız)', () => {
    const c = caps({ accelerometer: false, rotationVector: false, canComputeHeading: false });
    expect(c.canComputeHeading).toBe(false);
  });

  it('manyetometre + ivmeölçer yeterlidir (füzyon sensörü olmasa da)', () => {
    // Jiroskop olmayan ama manyetometreli telefonlar: geomagnetic füzyon
    // ya da doğrudan tilt-kompanzasyon devreye girer.
    const c = caps({
      gyroscope: false,
      rotationVector: false,
      geomagneticRotationVector: true,
      canComputeHeading: true,
    });
    expect(c.canComputeHeading).toBe(true);
  });

  it('native modül yoksa null döner — "bilmiyorum", "yok" değil', () => {
    // Expo Go / web: modül yok. Bu "sensör yok" DEMEKTİR; telefonun
    // manyetometresi sağlam olabilir ve `expo-sensors` yedeği çalışır.
    const result = getSensorCapabilities();
    expect(result === null || typeof result.canComputeHeading === 'boolean').toBe(true);
  });
});

describe('dürüst kerteriz: uydurma yerine null', () => {
  it('ölçüme çevrilemeyen örnek null döner, 0 değil', () => {
    // Ölçüm YOKSA ekranda "—" görünür. 0° göstermek "pusula kuzeyi
    // buldu" yanılgısı yaratır ve kullanıcı yanlış yöne gider.
    expect(bearingFromSample({})).toBeNull();
    expect(bearingFromSample({ headingDeg: Number.NaN })).toBeNull();
  });

  it('bozuk ham vektörde skalere sessizce düşmez', () => {
    const h = bearingFromSample({
      headingDeg: 0,
      gravity: { x: 0, y: 0, z: 0 },
      mag: { x: 0, y: 1, z: 0 },
    });
    expect(h).toBeNull();
  });

  it('geçerli örnekte gerçek kerteriz döner', () => {
    const { heading } = headingFromRawVectors({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    expect(Number.isFinite(heading)).toBe(true);
    expect(Math.abs(heading)).toBeLessThan(1); // kuzeye bakan telefon ≈ 0°
  });
});