/**
 * HARİTA ALTYAPISI — PASİF HAZIR (v1'de ekran yok, native bağımlılık yok).
 *
 * Aktivasyon planı (gelecek release):
 * 1. `npx expo install @maplibre/maplibre-react-native`
 * 2. `app.json` plugins'e `"@maplibre/maplibre-react-native"` ekle (config plugin:
 *    iOS Podfile'a `$MLRN.post_install`, Android'e gradle varyantını işler).
 * 3. `npx expo prebuild --clean && npx expo run:android` ile yeniden derle
 *    (MapLibre Expo Go'da ÇALIŞMAZ — development build şart).
 * 4. Prod tile URL'ini EAS secret olarak ver (`MAP_STYLE_URL`).
 */
export const MAP_STYLE = {
  /** Geliştirme: MapLibre demo tiles (anahtarsız). */
  dev: 'https://demotiles.maplibre.org/style.json',
  /** Üretim: kendi stilin (OSM tabanlı; örn. Stadia/MapTiler/self-hosted). */
  prod: process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json',
} as const;

export function getMapStyleUrl(): string {
  return __DEV__ ? MAP_STYLE.dev : MAP_STYLE.prod;
}

/** Navigasyon rotası için soyut interface (ileride Valhalla/OSRM). */
export interface RouteRequest {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  profile: 'foot' | 'car' | 'bike';
}
