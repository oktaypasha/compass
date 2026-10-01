import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'compass.themeMode.v1';

export interface ThemeColors {
  label: string;
  secondaryLabel: string;
  separator: string;
  systemBackground: string;
  secondarySystemBackground: string;
  systemBlue: string;
  systemRed: string;
  systemGreen: string;
  systemOrange: string;
  onTint: string;
  /**
   * Kadran mürekkebi — koyu temada TAM beyaz / metalik beyaz.
   *
   * Neden `label` değil: `label` bir UI metin rengi ve tasarım sisteminde
   * kontrast için kısılmış olabilir; kadran ise bir grafik yüzey ve daima
   * maksimum kontrast istiyor. Koyu temada saf `#ffffff` (metallic değil, net
   * beyaz) taksimat ve rakamların siyah zeminde yutulmasını engeller.
   */
  dialInk: string;
  /** İkincil kadran çizgileri (su terazisi çaprazı) — ana mürekkepten soluk. */
  dialInkDim: string;
  /** Merkez su terazisi tablasının zemini. */
  dialPlate: string;
}

const light: ThemeColors = {
  label: '#000000',
  secondaryLabel: '#3c3c43',
  separator: '#c6c6c8',
  systemBackground: '#ffffff',
  secondarySystemBackground: '#f2f2f7',
  systemBlue: '#007aff',
  systemRed: '#ff3b30',
  systemGreen: '#34c759',
  systemOrange: '#ff9500',
  onTint: '#ffffff',
  // ⚠️ Kullanıcı geri bildirimi (Samsung): "kadran renkleri arka plan içinde
  // yutuluyor, sönük kaldı, zor seçiliyor." Açık temada mürekkep TAM SİYAH
  // olmalı. Önceden `separator` (#c6c6c8) kullanılıyordu; beyaz zeminde bu
  // neredeyse görünmez — taksimat ve rakamlar arka plana karışıyordu.
  dialInk: '#000000',
  // Çapraz çizgiler tam siyah değil (çok sert olurdu) ama yine de okunur.
  dialInkDim: '#8a8a8e',
  dialPlate: '#ededf2',
};

const dark: ThemeColors = {
  label: '#ffffff',
  secondaryLabel: '#ebebf5',
  separator: '#38383a',
  systemBackground: '#000000',
  secondarySystemBackground: '#1c1c1e',
  systemBlue: '#0a84ff',
  systemRed: '#ff453a',
  systemGreen: '#30d158',
  systemOrange: '#ff9f0a',
  onTint: '#ffffff',
  // Koyu temada tam beyaz: siyah zeminde maksimum kontrast. `#ebebf5` gibi
  // kısılmış bir ton taksimatı yutuyordu.
  dialInk: '#ffffff',
  dialInkDim: '#8e8e93',
  dialPlate: '#1c1c1e',
};

const DIAL_CARD_LIGHT = '#101014';
const DIAL_CARD_DARK = '#16161c';

export function colorsFor(scheme: ColorScheme): ThemeColors & { dialCard: string } {
  const base = scheme === 'dark' ? dark : light;
  // Koyu temada merkez kart zemini bir ton açılır: kart dönen gülle yapışmasın.
  return { ...base, dialCard: scheme === 'dark' ? DIAL_CARD_DARK : DIAL_CARD_LIGHT };
}

interface ThemeValue {
  /** Gerçekte uygulanan şema (mod 'system' ise cihazdan gelir). */
  scheme: ColorScheme;
  /** Kullanıcının seçimi. */
  mode: ThemeMode;
  colors: ThemeColors;
  /** Merkez kart zemini — tema duyarlı (kadranın geri kalanı değil). */
  dialCard: string;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Tema sağlayıcı — `system | light | dark`.
 *
 * Neden bağlam (context): ekranlar `StyleSheet.create` ile modül seviyesinde stil
 * üretiyordu; `colors` sabit olduğu için karanlık mod imkânsızdı. Şimdi renkler
 * bağlamdan gelir ve stiller `useMemo` ile şemaya göre yeniden üretilir.
 *
 * Kadranın kendi renkleri (metalik, koyu yüz) BİLEREK şemadan bağımsızdır:
 * gerçek pusulalar da her iki temada koyu kalır ve metalik taksimat koyu zeminde
 * okunur. Tek istisna: koyu temada `dialCard` bir ton açılır ki kart gülle
 * yapışmasın.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((raw) => {
        if (!alive || raw !== 'light' && raw !== 'dark' && raw !== 'system') return;
        setModeState(raw);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, m).catch(() => undefined);
  };

  const scheme: ColorScheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeValue>(
    () => ({ scheme, mode, colors: colorsFor(scheme), dialCard: colorsFor(scheme).dialCard, setMode }),
    [scheme, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Tema bağlamı. Provider dışında çağrılırsa açık temaya düşer (testler için). */
export function useTheme(): ThemeValue {
  return (
    useContext(ThemeContext) ?? {
      scheme: 'light',
      mode: 'system',
      colors: light,
      dialCard: DIAL_CARD_LIGHT,
      setMode: () => undefined,
    }
  );
}
