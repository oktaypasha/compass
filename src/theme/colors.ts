import { Platform } from 'react-native';

/**
 * Statik palet — AÇIK tema değerleri + kadran (tema bağımsız) renkleri.
 *
 * Neden hâlâ var: `theme-provider.tsx` karanlık/ açık seçimini yönetir ve
 * ekranlar `useTheme().colors` kullanır. Bu dosyadaki `colors` ise (a) kadranın
 * her iki temada koyu kalması gereken metalik token'larını ve (b) modül seviyesi
 * `StyleSheet.create` içinde kalan geçiş referansını taşır.
 *
 * Yeni ekran/ bileşende renk alacaksan `useTheme()` kullan, buradan değil.
 */

const light = {
  label: '#000000',
  secondaryLabel: '#3c3c43',
  separator: '#c6c6c8',
  systemBackground: '#ffffff',
  secondarySystemBackground: '#f2f2f7',
  systemBlue: '#007aff',
  systemRed: '#ff3b30',
  systemGreen: '#34c759',
  systemOrange: '#ff9500',
} as const;

const dark = {
  label: '#ffffff',
  secondaryLabel: '#ebebf5',
  separator: '#38383a',
  systemBackground: '#000000',
  secondarySystemBackground: '#1c1c1e',
  systemBlue: '#0a84ff',
  systemRed: '#ff453a',
  systemGreen: '#30d158',
  systemOrange: '#ff9f0a',
} as const;

export type ColorScheme = 'light' | 'dark';

/** Şemaya göre palet seçer — `useTheme()` zaten doğru paleti verir. */
export function palette(scheme: ColorScheme) {
  return Platform.select({ default: scheme === 'dark' ? dark : light })!;
}

export const colors = {
  ...light,
  /** Aksan zemin üzerindeki yazı — iki modda da sabit beyaz. */
  onTint: '#ffffff',
  /** Pusula iğnesi kuzeyi — marka kararı, iki modda sabit. */
  needleNorth: '#e5484d',
  /**
   * Kadran yüzü: koyu, neredeyse siyah daire. Uygulama açık temada olsa da
   * kadran koyu kalır — metalik taksimet ve rakamlar yalnızca koyu zeminde
   * okunur (kontrast), bu yüzden sabit bir palettir.
   */
  dialFace: '#0b0b0e',
  dialCard: '#101014',
  /** Metalik gümüş tonları (çember, taksimat, rakam). */
  dialMetal: '#a8aeb9',
  dialMetalHi: '#eef1f6',
  dialMetalDim: '#6e747f',
  dialMetalText: '#c8cdd6',
  /** Yön harfleri ve merkez kart yazısı. */
  dialText: '#e9e9ec',
  dialTextDim: '#9a9aa2',
  dialStar: '#d8dbe2',
} as const;
