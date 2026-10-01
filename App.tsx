import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SandwichMenu } from './src/components/sandwich-menu';
import { ThemedText } from './src/components/themed-text';
import { applyStoredLanguage } from './src/i18n';
import { useCompassHeading, type CompassState } from './src/hooks/use-compass-heading';
import { useLocationInfo, type LocationInfo } from './src/hooks/use-location-info';
import { CompassScreen } from './src/screens/compass';
import { SettingsScreen } from './src/screens/settings';
import { radius, scaled, spacing, useResponsiveScale, ThemeProvider, useTheme } from './src/theme';

type Tab = 'compass' | 'settings';

/**
 * Kabuk: sensör/konum durumunun TEK sahibi ve iki sekmeli gezinme.
 *
 * Neden hook'lar burada: `useCompassHeading()` her çağrıda kendi sensör
 * aboneliğini açar ve 50 Hz üretir. İki ekran da kendi hook'unu çağırsaydı iki
 * abonelik, iki sensör akışı ve iki `push` yarışı olurdu. Durum burada
 * yaşar, ekranler saf görünüm (props) olur.
 *
 * Neden router değil: iki sekme için `expo-router` gereksiz bir bağımlılık ve
 * dosya yapısı demek. Sekmeler büyürse taşınabilir.
 */
function Shell() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  // Android 15+/16 edge-to-edge: uygulama penceresi sistem navigasyon
  // çubuğunun ALTINA çizer. Bottom inset uygulanmazsa sekme çubuğu ve son
  // içerik, dokunmaların çalınacağı alanda kalır (Settings'e basılamaz).
  const insets = useSafeAreaInsets();
  const resp = useResponsiveScale();
  const [tab, setTab] = useState<Tab>('compass');
  const [menuOpen, setMenuOpen] = useState(false);
  const [i18nReady, setI18nReady] = useState(false);
  const compass = useCompassHeading();
  const loc = useLocationInfo();

  // Kayıtlı dil tercihi, İLK KAREDEN ÖNCE uygulanır.
  //
  // Önceden i18next `matchDeviceLocale()` ile senkron açılır, sonra bu efekt
  // AsyncStorage'ı asenkron okuyup dili değiştiriyordu. Canlıda bunun sonucu:
  // ekranlar İngilizce açılıyor, açılan menü Türkçe görünüyordu (yeni mount
  // olan Modal güncel dili, eski mount olan ekranlar eski dili okuyor).
  // Bu yüzden Shell, tercih okunana kadar render edilmez: ilk kare de doğru.
  useEffect(() => {
    let alive = true;
    void applyStoredLanguage().finally(() => {
      if (alive) setI18nReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Sapma tek yerden beslenir: otomatik (konum/WMM) varsa o, yoksa elle girilen.
  // 0 elle değeri "girilmemiş" demektir → Manyetik kuzeye düşer.
  const effectiveDeclination =
    loc.declinationDeg ?? (compass.manualDeclinationDeg === 0 ? null : compass.manualDeclinationDeg);
  useEffect(() => {
    compass.setDeclinationDeg(effectiveDeclination);
  }, [compass, effectiveDeclination]);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.systemBackground, paddingTop: i18nReady ? insets.top : 0 },
      ]}
    >
      {i18nReady && (
        <>
          {/*
            Başlık satırı: hamburger + başlık.
            ⚠️ Önceden hamburger `position: absolute; top/left: 0` idi ve iPhone'da
            DOKUNMA ALANI DÜŞMÜYORDU (mutlak konum + zIndex, iOS'un dokunma
            sırası ve ScrollView'ın üstüne binmesi). Artık normal bir flex çocuk:
            hem görsel olarak başlığın hemen solunda, hem de guaranteed tıklanır.

            ⚠️ ORTALAMA: başlık `flex: 1` idi ve hamburger'ın genişliği kadar
            sola yaslanmış başlığı sağa itiyordu — başlık ekranın ortasında
            DEĞİLDİ (kullanıcı isteği). Çözüm: başlığın kendi satırında ortalanıp
            iki yanda eşit genişlikli boş yuva (spacer) bulunması. Hamburger
            görsel olarak başlığın solunda kalır, başlık tam ortada olur.
          */}
          <View style={[styles.header, { paddingHorizontal: scaled(spacing.md, resp.scale) }]}>
            {/* Sol yuva: hamburger'ı taşır. */}
            <View style={styles.headerSide}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('menu.open')}
                onPress={() => setMenuOpen(true)}
                style={({ pressed }) => [
                  styles.menuButton,
                  { backgroundColor: colors.secondarySystemBackground, opacity: pressed ? 0.6 : 1 },
                ]}
                hitSlop={10}
              >
                <View style={[styles.menuBar, { backgroundColor: colors.label }]} />
                <View style={[styles.menuBar, { backgroundColor: colors.label }]} />
                <View style={[styles.menuBar, { backgroundColor: colors.label }]} />
              </Pressable>
            </View>
            {/* Başlık ortada — iki yuva EŞİT genişlik olduğu için gerçekten eşit
                paya sahiptir; aksi halde hamburger başlığı yine kaydırıyordu. */}
            <ThemedText
              variant="title"
              style={[styles.headerTitle, { fontSize: scaled(19, resp.scale) }]}
            >
              {t(tab === 'compass' ? 'app.title' : 'settings.title')}
            </ThemedText>
            {/* Sağ yuva: hamburger ile aynı genişlik, görünmez. */}
            <View style={styles.headerSide} />
          </View>
          <View style={styles.content}>
            {tab === 'compass' ? (
              <CompassScreen compass={compass} loc={loc} />
            ) : (
              <SettingsScreen compass={compass} loc={loc} />
            )}
          </View>
          {/* Sandviç menü: gezinme + dil + tema + sözleşmeler. */}
          <SandwichMenu
            onNavigate={setTab}
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </>
      )}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  /**
   * Başlığın iki yanındaki EŞİT yuva. Hamburger solda görünür, sağdaki yuva
   * görünmez ama aynı genişliği işgal eder → başlık ekranın tam ortasında olur.
   * `minWidth` verilmezse hamburger genişliğinden farklı olursa kayma olur.
   */
  headerSide: { minWidth: 44, alignItems: 'flex-start' },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuBar: { width: 18, height: 2, borderRadius: 1 },
  headerTitle: { flex: 1, textAlign: 'center' },
  content: { flex: 1 },
});

export type { CompassState, LocationInfo };
