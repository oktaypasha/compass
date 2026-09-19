# Pusula (Compass)

Tek codebase ile Android + iOS pusula uygulaması. Expo SDK 57 (CNG), React 19, TypeScript strict.

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm start` | Metro dev server |
| `npx expo run:android` | Yerel debug derleme + kabloyla kur (`adb`) |
| `npx expo run:android --variant release` | Gerçek smooth testi için release APK |
| `npm test` | Jest (`jest-expo` preset) |
| `npm run lint` | ESLint (`eslint-config-expo`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run doctor` | `expo-doctor` (21/21 geçmeli) |

## Mimari

* `src/utils/heading.ts` — saf pusula matematiği (unit-testli): sin/cos EMA,
  en-kısa-yay delta, vektör tilt-kompanzasyonu, complementary filter, unwrap.
* `src/hooks/use-compass-heading.ts` — 50 Hz sensör füzyonu; animasyon
  UI-thread `SharedValue` ile, re-render yok (sayısal okuma 5 Hz kısılır).
* `src/components/compass-dial.tsx` — SVG kadran, tek `rotate` transformu.
* `src/theme/` — merkezi tasarım tokenları (renk/aralık/tipografi/yarıçap/gölge/hareket).
* `src/i18n/locales/*.json` — merkezi çeviriler (tr + en).
* `src/features/map/` — **pasif** harita altyapısı (aktivasyon planı `map-style.ts` içinde).

## Önemli notlar

* Ekran görüntüsü PowerShell'de `adb exec-out screencap -p > dosya` ile ALINMAZ
  (binary bozulur). Doğrusu: `adb shell screencap -p /sdcard/x.png` + `adb pull`.
* Global legacy `expo-cli` kurulmaz — yerel `npx expo` kullanılır.
* Harita (MapLibre) Expo Go'da çalışmaz; development build gerekir.
