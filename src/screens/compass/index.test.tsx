import { render as rtlRender, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../../i18n';
import { CompassScreen } from './index';
import { useCompassHeading } from '../../hooks/use-compass-heading';
import { useLocationInfo } from '../../hooks/use-location-info';
import { buildShareMessage, geoUri } from '../../utils/place';

jest.mock('../../hooks/use-compass-heading');
jest.mock('../../hooks/use-location-info');
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockCompass = {
  headingSV: { value: 0, get: () => 0, set: jest.fn() },
  headingDeg: 352,
  ready: true,
  cardinalIdx: 0,
  fieldStrength: 48,
  fieldQuality: 'normal',
  sensorAccuracy: 3,
  pose: 'flat',
  level: true,
  bubble: { pitchDeg: 0, rollDeg: 0, bubbleX: 0, bubbleY: 0 },
  simulated: false,
  available: true,
  source: 'system',
  reference: 'magnetic',
  setReference: jest.fn(),
  declinationDeg: 6.2,
  setDeclinationDeg: jest.fn(),
} as unknown as ReturnType<typeof useCompassHeading>;

const mockLocation = {
  status: 'ready',
  latitude: 41.0082,
  longitude: 28.9784,
  accuracyMeters: 12,
  address: {
    street: 'Caferağa Mah. 45',
    district: 'Caferağa Mahallesi',
    city: 'Kadıköy',
    region: 'İstanbul',
    country: 'Türkiye',
    postalCode: '34710',
    name: 'Caferağa',
  },
  declinationDeg: 6.2,
  declinationFromCache: false,
  sunrise: '05:31',
  sunset: '20:39',
  addressLine: 'Caferağa Mah. 45 34710, Caferağa Mahallesi, Kadıköy, İstanbul, Türkiye',
  coordinateLine: '41.008200, 28.978400',
  hasFix: true,
  refresh: jest.fn(),
} as unknown as ReturnType<typeof useLocationInfo>;

/** Testlerin kullandigi anlik konum degeri (mock degistirilince tek yerden). */
let curLoc: ReturnType<typeof useLocationInfo>;

beforeEach(() => {
  jest.clearAllMocks();
  (useCompassHeading as jest.Mock).mockReturnValue(mockCompass);
  (useLocationInfo as jest.Mock).mockReturnValue(mockLocation);
  curLoc = mockLocation;
});

/** Ekran useSafeAreaInsets kullanıyor (kadran yüksekliği); sağlayıcı şart. */
async function render(ui: React.ReactElement) {
  const metrics = {
    frame: { x: 0, y: 0, width: 360, height: 672 },
    insets: { top: 24, left: 0, right: 0, bottom: 48 },
  };
  return rtlRender(
    <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>,
  );
}

describe('CompassScreen composition', () => {
  it('shows sunrise and sunset in local time above the dial', async () => {
    await render(<CompassScreen compass={mockCompass} loc={curLoc} />);
    expect(screen.getByText('Sunrise')).toBeTruthy();
    expect(screen.getByText('Sunset')).toBeTruthy();
    expect(screen.getByText('05:31')).toBeTruthy();
    expect(screen.getByText('20:39')).toBeTruthy();
  });

  it('shows the open address in the requested order', async () => {
    await render(<CompassScreen compass={mockCompass} loc={curLoc} />);
    expect(
      screen.getByText('Caferağa Mah. 45 34710, Caferağa Mahallesi, Kadıköy, İstanbul, Türkiye'),
    ).toBeTruthy();
  });

  it('shows the coordinates and the accuracy', async () => {
    await render(<CompassScreen compass={mockCompass} loc={curLoc} />);
    expect(screen.getByText('41.008200, 28.978400')).toBeTruthy();
    expect(screen.getByText('±12 m')).toBeTruthy();
  });

  it('keeps the north reference out of the main screen (it lives in Settings)', async () => {
    await render(<CompassScreen compass={mockCompass} loc={curLoc} />);
    expect(screen.queryByText('Magnetic')).toBeNull();
    expect(screen.queryByText('True')).toBeNull();
  });

  it('warns only when true north is selected without a fix', async () => {
    curLoc = { ...mockLocation, declinationDeg: null };
    await render(<CompassScreen compass={mockCompass} loc={curLoc} />);
    // Manyetik modda uyarı da yok.
    expect(screen.queryByText('True north needs a location fix')).toBeNull();

    await render(
      <CompassScreen compass={{ ...mockCompass, reference: 'true' }} loc={curLoc} />,
    );
    expect(screen.getByText('True north needs a location fix')).toBeTruthy();
  });

it('never shows a heading before the first sensor sample', async () => {
    await render(
      <CompassScreen compass={{ ...mockCompass, headingDeg: null, ready: false }} loc={curLoc} />,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });

  /*
   * A21S SENARYOSU — canlı ekran görüntüsünden türetilmiş regresyon testleri.
   *
   * Samsung Galaxy J7 Prime 2'de (manyetometre YOK) kullanıcı şunları gördü:
   *   1. Soluk gri kadran  → `opacity={ready ? 1 : 0.35}` ve `ready` KALICI false
   *   2. "Doğruluk: 0 µT" → ölçüm değil, `useState(0)` başlangıcının sızıntısı
   *   3. Açıklama yok      → uydurma derece yerine dürüst bir bildirim olmalı
   */
  describe('manyetometresiz cihaz (Galaxy J7 Prime 2)', () => {
    const noMag = {
      ...mockCompass,
      headingDeg: null,
      ready: false,
      hardware: 'no-magnetometer' as const,
      fieldStrength: 0,
      available: false,
    };

    it('uydurma derece yerine "—" gösterir', async () => {
      await render(<CompassScreen compass={noMag} loc={curLoc} />);
      // "—" var ve HİÇBİR sayısal kerteriz basılmıyor.
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/North-East/)).toBeNull();
      expect(screen.queryByText(/^\d+°$/)).toBeNull();
    });

    it('NEDENINI açıklar: donanım eksikliği, uygulama hatası değil', async () => {
      await render(<CompassScreen compass={noMag} loc={curLoc} />);
      expect(screen.getByText('No compass in this device')).toBeTruthy();
      expect(screen.getByText(/no magnetometer/)).toBeTruthy();
      // Neyin ÇALIŞTIĞINI da söyler — kullanıcı her şeyin bozuk olduğunu sanmasın.
      expect(screen.getByText(/still work/)).toBeTruthy();
    });

    it('uydurma "0 µT" YAZMAZ (ölçümsüz bir sayı gösterilmez)', async () => {
      await render(<CompassScreen compass={noMag} loc={curLoc} />);
      // Alan şiddeti 0 µT YAZILMAZ: manyetometre yoksa alan da yoktur.
      expect(screen.queryByText(/0 µT/)).toBeNull();
      expect(screen.queryByText(/Accuracy/)).toBeNull();
    });

    it('konum ve gün doğumu/batımı çalışmaya devam eder', async () => {
      await render(<CompassScreen compass={noMag} loc={curLoc} />);
      // Pusula yokken diğer özellikler çalışır; kullanıcı uygulamayı silmesin.
      expect(screen.getByText('Sunrise')).toBeTruthy();
      expect(screen.getByText('05:31')).toBeTruthy();
      expect(screen.getByText('41.008200, 28.978400')).toBeTruthy();
    });

    it('simülasyonu ASLA otomatik başlatmaz', async () => {
      await render(
        <CompassScreen compass={{ ...noMag, simulated: true }} loc={curLoc} />,
      );
      // Simülasyon yalnız ayarlardan açıkça açılabilir ve o zaman "DEMO" yazar.
      expect(screen.getByText(/DEMO/)).toBeTruthy();
    });
  });

  it('alan şiddeti 0 ise "—" yazar, 0 µT değil', async () => {
    // Manyetometre var ama henüz veri gelmedi: "bilinmiyor" ≠ "sıfır".
    await render(
      <CompassScreen compass={{ ...mockCompass, fieldStrength: 0 }} loc={curLoc} />,
    );
    expect(screen.queryByText(/0 µT/)).toBeNull();
    expect(screen.getByText(/Accuracy: —/)).toBeTruthy();
  });

  it('degrades honestly when there is no fix', async () => {
    curLoc = {
      ...mockLocation,
      status: 'unavailable',
      sunrise: null,
      sunset: null,
      addressLine: null,
      coordinateLine: null,
      declinationDeg: null,
      hasFix: false,
    };
    (useLocationInfo as jest.Mock).mockReturnValue(curLoc);
    await render(<CompassScreen compass={mockCompass} loc={curLoc} />);
    expect(screen.getByText('No location fix — try outdoors')).toBeTruthy();
    // Saatler uydurulmaz.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('builds a shareable message with both map apps and a geo: uri', () => {
    const msg = buildShareMessage(mockLocation.addressLine, 41.0082, 28.9784, 12);
    expect(msg).toContain('Google Maps:');
    expect(msg).toContain('Apple Maps:');
    expect(msg).toContain('±12 m');
    expect(geoUri(41.0082, 28.9784, 'Kadıköy')).toContain('geo:41.0082,28.9784');
  });


});

