import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from './button';
import { useTheme } from '../../theme';

/**
 * Canlıda iki kez görüldü ve testler yakalamadı:
 * 1. Koyu temada buton YAZISI tamamen görünmez oldu ("Haritada aç",
 *    "Konumu paylaş", menüdeki ✕) — sadece kenarlık çiziliydi.
 * 2. Açık temada aynı yerler siyah zeminde siyah yazı gibi duruyordu.
 *
 * Sebep: `variants[variant].fg` bir RENK ANAHTARIDIR (`'label'`). Doğrudan
 * `color: variants[variant].fg` yazılırsa React Native geçersiz bir renk
 * alır ve metni kendi varsayılanına (siyah) düşürür — yani hata TEMA
 * BAĞIMSIZ görünür. Aşağıdaki testler tam olarak bu yüzden var.
 */
jest.mock('../../theme', () => {
  const actual = jest.requireActual('../../theme');
  return { ...actual, useTheme: jest.fn() };
});

const useThemeMock = useTheme as jest.Mock;

function theme(scheme: 'light' | 'dark') {
  const { colorsFor } = jest.requireActual('../../theme');
  return { colors: colorsFor(scheme), scheme, mode: scheme, setMode: jest.fn() };
}

describe('Button label colour', () => {
  beforeEach(() => {
    useThemeMock.mockReturnValue(theme('dark'));
  });

  it.each(['light', 'dark'] as const)('is visible in the %s theme', async (scheme) => {
    useThemeMock.mockReturnValue(theme(scheme));
    await render(<Button title="Konumu paylaş" />);
    const label = screen.getByText('Konumu paylaş');
    // Metnin rengi butonun arka planından AYRI olmalı.
    const { colors } = theme(scheme);
    expect(label.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: colors.label })]),
    );
    expect(colors.label).not.toBe(colors.systemBackground);
  });

  it('never passes a colour KEY as a colour value', async () => {
    await render(<Button title="X" />);
    const label = screen.getByText('X');
    const flat = JSON.stringify(label.props.style);
    // 'label' / 'systemBlue' gibi anahtarlar renk değeri olamaz.
    expect(flat).not.toMatch(/"(label|onTint|secondaryLabel|systemBlue|separator)"/);
  });

  it('keeps the primary button readable on its tint', async () => {
    await render(<Button title="Gerçek kuzey" />);
    const label = screen.getByText('Gerçek kuzey');
    const { colors } = theme('dark');
    expect(JSON.stringify(label.props.style)).toContain(colors.onTint);
    expect(JSON.stringify(label.props.style)).toMatch(new RegExp(colors.onTint));
  });

  it('gives secondary buttons a visible border', async () => {
    await render(<Button title="Haritada aç" variant="secondary" />);
    const btn = screen.getByLabelText('Haritada aç');
    const flat = JSON.stringify(btn.props.style);
    // secondary her zaman kenarlıklı (metin siyah zeminde de okunur).
    expect(flat).toMatch(/"borderWidth":1\.5/);
  });

  it('reports disabled state so a test can assert limits', async () => {
    await render(<Button title="+" disabled />);
    expect(screen.getByLabelText('+').props.accessibilityState?.disabled).toBe(true);
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button title="Tekrar dene" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Tekrar dene'));
    expect(onPress).toHaveBeenCalled();
  });
});
