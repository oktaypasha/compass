import { render, screen, fireEvent } from '@testing-library/react-native';
import '../../i18n';
import { SettingsScreen } from './index';
import type { CompassState } from '../../hooks/use-compass-heading';
import type { LocationInfo } from '../../hooks/use-location-info';

function makeCompass(over: Partial<CompassState> = {}): CompassState {
  return {
    headingSV: { value: 0, get: () => 0, set: jest.fn() } as unknown as CompassState['headingSV'],
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
    declinationDeg: 6.3,
    setDeclinationDeg: jest.fn(),
    offsetDeg: 0,
    setOffsetDeg: jest.fn(),
    manualDeclinationDeg: 0,
    setManualDeclinationDeg: jest.fn(),
    ...over,
  } as unknown as CompassState;
}

function makeLoc(over: Partial<LocationInfo> = {}): LocationInfo {
  return {
    status: 'ready',
    latitude: 41.0776,
    longitude: 28.3672,
    accuracyMeters: 100,
    address: null,
    declinationDeg: 6.3,
    declinationFromCache: false,
    sunrise: '07:01',
    sunset: '18:51',
    addressLine: 'Ortaköy Caddesi 71L, Selimpaşa 34590, İstanbul, Türkiye',
    coordinateLine: '41.077626, 28.367236',
    hasFix: true,
    refresh: jest.fn(),
    ...over,
  } as unknown as LocationInfo;
}

describe('SettingsScreen', () => {
  it('owns the magnetic / true north choice', async () => {
    const compass = makeCompass();
    await render(<SettingsScreen compass={compass} loc={makeLoc()} />);
    fireEvent.press(screen.getByLabelText('True north'));
    expect(compass.setReference).toHaveBeenCalledWith('true');
  });

  it('re-requests the location when true north is chosen without a declination', async () => {
    const compass = makeCompass();
    const loc = makeLoc({ declinationDeg: null });
    await render(<SettingsScreen compass={compass} loc={loc} />);
    fireEvent.press(screen.getByLabelText('True north'));
    expect(compass.setReference).toHaveBeenCalledWith('true');
    expect(loc.refresh).toHaveBeenCalled();
  });

  it('does not re-request the location when a declination already exists', async () => {
    const compass = makeCompass();
    const loc = makeLoc();
    await render(<SettingsScreen compass={compass} loc={loc} />);
    fireEvent.press(screen.getByLabelText('True north'));
    expect(loc.refresh).not.toHaveBeenCalled();
  });

  it('shows the automatic declination and trims the manual one', async () => {
    const compass = makeCompass({ manualDeclinationDeg: 0 });
    await render(<SettingsScreen compass={compass} loc={makeLoc()} />);
    expect(screen.getByText(/Automatic declination: 6.3/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('+6°'));
    expect(compass.setManualDeclinationDeg).toHaveBeenCalledWith(6);
  });

  it('explains the manual path when there is no fix', async () => {
    const compass = makeCompass({ manualDeclinationDeg: 0 });
    await render(<SettingsScreen compass={compass} loc={makeLoc({ declinationDeg: null })} />);
    // Hem kuzey referansı ipucu hem de sapma kartı aynı yolu anlatır.
    expect(screen.getAllByText(/set it by hand/).length).toBeGreaterThanOrEqual(1);
  });

  it('trims the magnetic offset and disables the limits', async () => {
    const compass = makeCompass({ offsetDeg: 20 });
    await render(<SettingsScreen compass={compass} loc={makeLoc()} />);
    // Aynı "+" etiketi iki kartta da var; ilki manyetik ofsete ait.
    const plus = screen.getAllByLabelText('+')[0]!;
    expect(plus.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(screen.getAllByLabelText('−')[0]!);
    expect(compass.setOffsetDeg).toHaveBeenCalledWith(19);
  });
});
