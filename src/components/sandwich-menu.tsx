import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRtl, LANGUAGES, setLanguage, type AppLocale } from '../i18n';
import {
  radius,
  scaled,
  shadows,
  spacing,
  useResponsiveScale,
  useTheme,
  type ThemeColors,
  type ThemeMode,
} from '../theme';
import { ThemedText } from './themed-text';
import { Button } from './ui/button';

/** Menüde açılabilen alt listeler. */
type Expandable = 'language' | 'theme' | null;
type LegalDoc = 'privacy' | 'terms' | null;
type Tab = 'compass' | 'settings';

interface Props {
  /** Menüde "Pusula" ve "Ayarlar" girdileri. */
  onNavigate: (tab: Tab) => void;
  /** Panel kabuk tarafından kontrol edilir. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Sandviç (hamburger) menü — dil, tema ve sözleşmeler burada.
 *
 * Neden ayrı bileşen: ekranlar sadece kendi içeriğini bilir; menü tam ekran
 * modal olduğu için yeniden başlatmadan açılıp kapanır ve dil değişimi ANINDA
 * yansır (i18next senkron çalışır).
 */
export function SandwichMenu({ onNavigate, open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  // Menü de responsive: dar ekranda satır yükseklikleri ve punto küçülür,
  // tablette büyür. Sabit `paddingVertical: 21` küçük ekranda çok yer yiyordu.
  const resp = useResponsiveScale();
  const px = (v: number) => scaled(v, resp.scale);
  const [expanded, setExpanded] = useState<Expandable>(null);
  const [legal, setLegal] = useState<LegalDoc>(null);
  // RTL: I18nManager.forceRTL restart gerektirir, o yüzden yön elle
  // çevrilir — dil değişimi anında yansımaya devam eder.
  const rtl = isRtl(i18n.language);
  // Tema yüzeyleri (panel/sayfa zemini) ve RTL yönü şemaya bağlı.
  const themed = useMemo(
    () =>
      StyleSheet.create({
        hamburgerBar: { backgroundColor: colors.label },
        panel: {
          backgroundColor: colors.systemBackground,
          boxShadow: shadows.overlay,
          // RTL: panel sağdan açılır, yuvarlatılmış köşeler ters döner.
          ...(rtl
            ? {
                right: 0,
                borderTopLeftRadius: radius.lg,
                borderBottomLeftRadius: radius.lg,
              }
            : {
                left: 0,
                borderTopRightRadius: radius.lg,
                borderBottomRightRadius: radius.lg,
              }),
        },
        sheet: {
          backgroundColor: colors.systemBackground,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          boxShadow: shadows.overlay,
        },
        rowActive: { backgroundColor: colors.secondarySystemBackground },
        divider: { backgroundColor: colors.separator },
        check: { color: colors.systemBlue },
        // RTL: hamburger sağa taşınır, satırlar ters dizilir, metin sağa yazılır.
        hamburger: rtl ? { right: 0, left: 'auto' } : { left: 0, right: 'auto' },
        row: { flexDirection: rtl ? 'row-reverse' : 'row' },
        text: {
          textAlign: rtl ? 'right' : 'left',
          writingDirection: rtl ? 'rtl' : 'ltr',
        },
      }),
    [colors, rtl],
  );

  // Panel genişliği ekrana göre: sabit `maxWidth: 460` tablette çok dar,
  // `width: '96%'` dar telefonda kenarları gereksiz yere daraltıyordu.
  const panelWidth = Math.min(
    resp.width * (resp.isTablet ? 0.42 : 0.94),
    460,
  );

  const setOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) setExpanded(null);
  };
  const close = () => setOpen(false);
  const go = (tab: Tab) => {
    onNavigate(tab);
    close();
  };


  const themeOptions: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'system', label: t('theme.system'), icon: '⚙️' },
    { mode: 'light', label: t('theme.light'), icon: '☀️' },
    { mode: 'dark', label: t('theme.dark'), icon: '🌙' },
  ];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={s.backdrop} onPress={close} accessibilityLabel={t('menu.close')} />
        <View style={[s.panel, themed.panel, { width: panelWidth }]}>
          <View
            style={[
              s.panelHead,
              {
                paddingHorizontal: px(spacing.xl),
                paddingTop: px(64),
                paddingBottom: px(spacing.lg),
              },
            ]}
          >
            <ThemedText variant="title" style={{ fontSize: px(19) }}>
              {t('app.title')}
            </ThemedText>
            <Button variant="secondary" size="sm" title="✕" onPress={close} />
          </View>

          <ScrollView
            style={s.panelScroll}
            contentContainerStyle={[
              s.panelContent,
              // Modal ayrı bir pencere: alt inset'i elle ekliyoruz, yoksa son
              // girdiler (Şartlar ve Koşullar) sistem navigasyon çubuğunun
              // altında kalıyor.
              { paddingBottom: insets.bottom + spacing.xxl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <MenuItem label={t('menu.compass')} onPress={() => go('compass')} strong />
            <MenuItem label={t('menu.settings')} onPress={() => go('settings')} strong />

            <View style={[s.divider, themed.divider]} />

            {/* Dil — açılır liste, kendi dilinde ad + ülke bayrağı */}
            <MenuItem
              label={t('menu.language')}
              expanded={expanded === 'language'}
              onPress={() => setExpanded(expanded === 'language' ? null : 'language')}
            />
            {expanded === 'language' && (
              <View style={s.subList}>
                {LANGUAGES.map((l) => (
                  <OptionRow
                    key={l.code}
                    icon={l.flag}
                    label={l.label}
                    hint={l.code}
                    active={i18n.language === l.code}
                    activeStyle={themed.rowActive}
                    checkStyle={themed.check}
                    rowStyle={themed.row}
                    textStyle={themed.text}
                    onPress={() => void setLanguage(l.code as AppLocale)}
                  />
                ))}
              </View>
            )}

            {/* Tema — açılır liste */}
            <MenuItem
              label={t('menu.theme')}
              expanded={expanded === 'theme'}
              onPress={() => setExpanded(expanded === 'theme' ? null : 'theme')}
            />
            {expanded === 'theme' && (
              <View style={s.subList}>
                {themeOptions.map((o) => (
                  <OptionRow
                    key={o.mode}
                    icon={o.icon}
                    label={o.label}
                    active={mode === o.mode}
                    activeStyle={themed.rowActive}
                    checkStyle={themed.check}
                    rowStyle={themed.row}
                    textStyle={themed.text}
                    onPress={() => setMode(o.mode)}
                  />
                ))}
              </View>
            )}

            <View style={[s.divider, themed.divider]} />

            {/* Sözleşmeler — başlık ve bağlantı yerinde; metin yakında. */}
            <MenuItem label={t('menu.privacy')} onPress={() => setLegal('privacy')} />
            <MenuItem label={t('menu.terms')} onPress={() => setLegal('terms')} />
          </ScrollView>
        </View>

        <Modal
          visible={legal !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setLegal(null)}
        >
          <Pressable style={s.backdrop} onPress={() => setLegal(null)} />
          <View style={[s.sheet, themed.sheet]}>
            <View style={s.panelHead}>
              <ThemedText variant="title" style={s.sheetTitle}>
                {legal === 'privacy' ? t('legal.privacyTitle') : t('legal.termsTitle')}
              </ThemedText>
              <Button variant="secondary" size="sm" title="✕" onPress={() => setLegal(null)} />
            </View>
            <ScrollView contentContainerStyle={s.sheetBody}>
              <ThemedText variant="body">{t('legal.pending')}</ThemedText>
            </ScrollView>
          </View>
        </Modal>
      </Modal>
  );
}

function MenuItem({
  label,
  onPress,
  expanded,
  strong,
}: {
  label: string;
  onPress: () => void;
  expanded?: boolean;
  strong?: boolean;
}) {
  const { colors } = useTheme();
  const resp = useResponsiveScale();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ expanded: !!expanded }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        s.item,
        {
          opacity: pressed ? 0.6 : 1,
          paddingVertical: scaled(21, resp.scale),
          paddingHorizontal: scaled(spacing.lg, resp.scale),
        },
      ]}
    >
      {/* `fit` ile tek satıra kilitli: dar ekranda menü etiketi iki satıra
          bölünüp komşu satırlarla hizasını bozuyordu. */}
      <ThemedText
        variant={strong ? 'title' : 'headline'}
        style={{ fontSize: scaled(strong ? 19 : 17, resp.scale) }}
      >
        {label}
      </ThemedText>
      {expanded !== undefined && (
        <ThemedText variant="subhead" style={{ color: colors.secondaryLabel }}>
          {expanded ? '▾' : '▸'}
        </ThemedText>
      )}
    </Pressable>
  );
}

/** Dil/tema satırı: ikon (bayrak) + kendi dilinde ad + seçim işareti. */
function OptionRow({
  icon,
  label,
  hint,
  active,
  onPress,
  activeStyle,
  checkStyle,
  rowStyle,
  textStyle,
}: {
  icon: string;
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
  activeStyle: object;
  checkStyle: object;
  rowStyle: object;
  textStyle: object;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active }}
      accessibilityLabel={hint ? `${label} (${hint})` : label}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        rowStyle,
        active ? activeStyle : null,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <ThemedText variant="body" style={s.rowIcon}>
        {icon}
      </ThemedText>
      <ThemedText variant="body" style={[s.rowLabel, textStyle]}>
        {label}
      </ThemedText>
      {active && (
        <ThemedText variant="headline" style={checkStyle}>
          ✓
        </ThemedText>
      )}
    </Pressable>
  );
}

/** Yerleşim (renkten bağımsız) tek yerlde; renkler yukarıdaki `themed`. */
const s = StyleSheet.create({
  hamburger: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 10,
  },
  bar: { width: 20, height: 2, borderRadius: 1, opacity: 0.9 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // Kullanıcı: "panel küçük ve yukarıda zor görünüyor, büyüt ve aşağı doğru
    // uzat". Neredeyse tam genişlik + aşağıdan başlayan yuvarlatılmış yüzey.
    width: '96%',
    maxWidth: 460,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    // Durum çubuğunun altına rahat sığacak kadar aşağı.
    paddingTop: 64,
    paddingBottom: spacing.lg,
  },
  panelScroll: { flex: 1 },
  panelContent: { paddingHorizontal: spacing.md, gap: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 21,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  subList: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: 17,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  rowIcon: { fontSize: 28 },
  rowLabel: { flex: 1 },
  divider: { height: 1, marginVertical: spacing.md, marginHorizontal: spacing.lg, opacity: 0.5 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%' },
  sheetTitle: { flexShrink: 1 },
  sheetBody: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
});

export type { ThemeColors };
