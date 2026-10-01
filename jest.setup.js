/**
 * Jest kurulumu.
 *
 * Reanimated 4 + react-native-worklets jest ortamında native modül bekliyor
 * (`loadUnpackers` TypeError). Bileşen testleri yalnızca `useSharedValue` ve
 * `useAnimatedStyle` kullandığı için elle basit bir uygulama yeterli: animasyon
 * stilini anında hesaplayıp düz bir `View`'a basarız.
 */
// AsyncStorage native modül bekliyor; resmi jest mock'u bellek içi çalışır.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Modal, gerçekte native bir host view'e bağlanır; test-renderer'da çocukları
// hiç render etmez (menü/sheet testleri bu yüzden hep boş çıkar). Şeffaf bir
// View gibi taklit ediyoruz: `visible=false` yine hiçbir şey render etmez,
// yani açık/kapalı durumları test edilebilir olur.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockModal = ({ visible, children }) =>
    visible ? React.createElement(View, null, children) : null;
  return { __esModule: true, default: MockModal };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
      // `createAnimatedComponent` SVG etiketlerinde de kullanılıyor
      // (kadran rakamlarını düz tutmak için). Olmazsa test paketi hiç yüklenmiyor.
      createAnimatedComponent: (c) => c,
    },
    createAnimatedComponent: (c) => c,
    useSharedValue: (initial) => {
      let v = initial;
      return {
        get: () => v,
        set: (next) => {
          v = next;
        },
        value: initial,
      };
    },
    useAnimatedProps: (fn) => fn(),
    useAnimatedStyle: (fn) => fn(),
    withTiming: (to) => to,
    withSpring: (to) => to,
    runOnJS: (fn) => fn,
  };
});
