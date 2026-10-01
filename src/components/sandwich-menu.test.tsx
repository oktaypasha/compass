import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../i18n';
import { SandwichMenu } from './sandwich-menu';

const mockSetMode = jest.fn();
// Tema sağlayıcısını gerçek paletle ama yakalanabilir setMode ile taklit et.
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 24, bottom: 48, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => insets,
  };
});

jest.mock('../theme', () => {
  const actual = jest.requireActual('../theme');
  return {
    ...actual,
    useTheme: () => ({
      scheme: 'light',
      mode: 'system',
      colors: actual.colorsFor('light'),
      setMode: mockSetMode,
    }),
  };
});

afterEach(async () => {
  await i18n.changeLanguage('en');
  mockSetMode.mockClear();
  rendered = false;
});

/**
 * Gerçek kabuk akışı: hamburger (kabukta) + kontrollü panel.
 * Tetikleyici panelin İÇİNDE değil — bu yüzden `openMenu()` ona basar.
 */
function Shell({ onNavigate = jest.fn() }: { onNavigate?: (t: 'compass' | 'settings') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityLabel="Open menu" onPress={() => setOpen(true)}>
        <Text>x</Text>
      </Pressable>
      <SandwichMenu onNavigate={onNavigate} open={open} onOpenChange={setOpen} />
    </>
  );
}

let rendered = false;
const renderPanel = (onNavigate?: (t: 'compass' | 'settings') => void) => {
  rendered = true;
  return rtlRender(<Shell onNavigate={onNavigate} />);
};

/** Hamburger'a basar ve panelin açılmasını bekler (gerekirse önce render). */
async function openMenu() {
  if (!rendered) await renderPanel();
  fireEvent.press(screen.getByLabelText('Open menu'));
  await waitFor(() => expect(screen.getByLabelText('Settings')).toBeTruthy());
}

/** Bir alt listeyi açar (dil/tema) ve ilk satırın gelmesini bekler. */
const expand = async (item: string, first: string) => {
  fireEvent.press(screen.getByLabelText(item));
  await waitFor(() => expect(screen.getByLabelText(first)).toBeTruthy());
};

describe('SandwichMenu', () => {
  it('renders nothing while the panel is closed', async () => {
    // Hamburger artık kabukta (App.tsx) başlığın solunda; burada sadece kapalı
    // panel hiçbir şey basmamalı.
    await rtlRender(<SandwichMenu onNavigate={jest.fn()} open={false} onOpenChange={jest.fn()} />);
    expect(screen.queryByText('Privacy Policy')).toBeNull();
  });

  it('lists the legal documents as placeholders', async () => {
    await openMenu();
    fireEvent.press(screen.getByLabelText('Privacy Policy'));
    expect(await screen.findByText('A contract will be added here soon.')).toBeTruthy();
  });

  it('navigates to a tab and closes', async () => {
    const onNavigate = jest.fn();
    await renderPanel(onNavigate);
    await openMenu();
    fireEvent.press(screen.getByLabelText('Settings'));
    expect(onNavigate).toHaveBeenCalledWith('settings');
    await waitFor(() => expect(screen.queryByLabelText('Settings')).toBeNull());
  });

  it('switches language instantly and persists it', async () => {
    await openMenu();
    await expand('Language', 'Türkçe (tr)');
    fireEvent.press(screen.getByLabelText('Türkçe (tr)'));
    // Anında: menü başlığı yeniden çevrildi, yeniden başlatma yok.
    await waitFor(() => expect(screen.getByText('Dil')).toBeTruthy());
    expect(i18n.language).toBe('tr');
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('compass.language.v1', 'tr'),
    );
  });

  it('drives the theme provider from the menu', async () => {
    await openMenu();
    await expand('Theme', 'Dark');
    fireEvent.press(screen.getByLabelText('Dark'));
    expect(mockSetMode).toHaveBeenCalledWith('dark');
  });

  it('shows every language in its own script with a country flag', async () => {
    await openMenu();
    await expand('Language', 'Türkçe (tr)');
    for (const label of ['العربية (ar)', 'Русский (ru)', '中文 (zh)', 'Türkçe (tr)', 'हिन्दी (hi)']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('relabels itself after a language change', async () => {
    await renderPanel();
    await act(async () => {
      await i18n.changeLanguage('de');
    });
  });
});
