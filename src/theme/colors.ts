import { Platform } from 'react-native';

/**
 * Merkezi renk paleti — TEK kaynak. Ekranlarda hex literal yasak.
 * v1: statik nötr palet (aydınlık/karanlıkta okunur). Router eklendiğinde
 * `expo-router` Color semantiklerine geçirilecek (TODO: semantic-colors).
 * (Reanimated worklet stillerine platform color objesi geçirilmez — burada
 *  hepsi string, worklet-güvenli.)
 */
const light = {
  label: '#000000',
  secondaryLabel: '#3c3c43',
  separator: '#c6c6c8',
  systemBackground: '#ffffff',
  secondarySystemBackground: '#f2f2f7',
  systemBlue: '#007aff',
};

const dark = {
  label: '#ffffff',
  secondaryLabel: '#ebebf5',
  separator: '#38383a',
  systemBackground: '#000000',
  secondarySystemBackground: '#1c1c1e',
  systemBlue: '#0a84ff',
};

export type ColorScheme = 'light' | 'dark';

/** Şemaya göre palet seçer — component içinde `useColorScheme()` ile beslenir. */
export function palette(scheme: ColorScheme) {
  return Platform.select({ default: scheme === 'dark' ? dark : light })!;
}

export const colors = {
  ...light,
  /** Aksan zemin üzerindeki yazı — iki modda da sabit beyaz. */
  onTint: '#ffffff',
  /** Pusula iğnesi kuzeyi — marka kararı, iki modda sabit. */
  needleNorth: '#e5484d',
  needleSouth: '#8e8e93',
  dialTick: '#636366',
} as const;
