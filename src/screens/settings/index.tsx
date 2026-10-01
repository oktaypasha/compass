import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { MANUAL_DECLINATION_LIMIT_DEG, type CompassState } from '../../hooks/use-compass-heading';
import type { LocationInfo } from '../../hooks/use-location-info';
import { radius, spacing, useResponsiveScale, useTheme, type ThemeColors } from '../../theme';
import { USER_OFFSET_LIMIT_DEG } from '../../utils/heading';

const TRIM_STEP_DEG = 1;
/** Elle sapma hızlı tuşları (Türkiye ≈ +4…+7°D). */
const DECLINATION_PRESETS = [4, 5, 6, 7];

interface Props {
  compass: CompassState;
  loc: LocationInfo;
}

/**
 * Ayarlar — kuzey referansı, kalibrasyon, sürüm.
 *
 * Dil ve tema menüye taşındı; burada yalnızca pusulaya özgü ayarlar kalır.
 * Manyetik/Gerçek seçimi de burada: ana ekran saf okuma yüzeyi.
 */
export function SettingsScreen({ compass, loc }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resp = useResponsiveScale();

  const {
    reference,
    setReference,
    offsetDeg,
    setOffsetDeg,
    manualDeclinationDeg,
    setManualDeclinationDeg,
    demoMode,
    setDemoMode,
    hardware,
  } = compass;

  // Okuma genişliği sınırı — tablette sınırsız büyüyen tek sütun okunmaz.
  const contentWidth = { width: '100%' as const, maxWidth: resp.contentMaxWidth };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.root, contentWidth]}
      showsVerticalScrollIndicator={false}
    >
      {/*
        DEMO MODU — uydurma kerteriz. Varsayılan KAPALI.
        ⚠️ Bu anahtar daha önce hiç yoktu; simülasyon OTOMATİK olarak açılıyordu
        ve manyetometresi olmayan telefonlarda uygulama "2° Kuzey" gibi uydurma
        bir okuma gösteriyordu. Kullanıcı bunu bozukluk sanıp uygulamayı siliyordu.
        Artık varsayılan davranış DÜRÜST: cihazda pusula yoksa açıklama gösterilir.
      */}
      <Card style={styles.card}>
        <ThemedText variant="subhead">{t('settings.demoMode')}</ThemedText>
        <ThemedText variant="caption" fit={false}>
          {t('settings.demoModeHint')}
        </ThemedText>
        <View style={styles.row}>
          <Button
            variant={demoMode ? 'primary' : 'secondary'}
            size="sm"
            title={demoMode ? t('settings.demoOn') : t('settings.demoOff')}
            onPress={() => setDemoMode(!demoMode)}
          />
        </View>
        {hardware === 'no-magnetometer' && (
          <ThemedText variant="caption" style={styles.hintWarn}>
            {t('compass.noMagnetometerTitle')}
          </ThemedText>
        )}
      </Card>

      <Card style={styles.card}>
        <ThemedText variant="subhead">{t('settings.northReference')}</ThemedText>
        <View style={styles.row}>
          <Button
            variant={reference === 'magnetic' ? 'primary' : 'secondary'}
            size="sm"
            title={t('settings.northMagnetic')}
            onPress={() => setReference('magnetic')}
          />
          <Button
            variant={reference === 'true' ? 'primary' : 'secondary'}
            size="sm"
            title={t('settings.northTrue')}
            onPress={() => {
              setReference('true');
              // Sapma hâlâ yoksa konum isteğini tazele.
              if (loc.declinationDeg === null) loc.refresh();
            }}
          />
        </View>
        <ThemedText variant="caption">{t('settings.northHint')}</ThemedText>
      </Card>

      <Card style={styles.card}>
        <ThemedText variant="subhead">{t('settings.offsetTitle')}</ThemedText>
        <ThemedText variant="caption">{t('settings.offsetHint')}</ThemedText>
        <View style={styles.row}>
          <Button
            variant="secondary"
            size="sm"
            title="−"
            disabled={offsetDeg <= -USER_OFFSET_LIMIT_DEG}
            onPress={() => setOffsetDeg(offsetDeg - TRIM_STEP_DEG)}
          />
          <ThemedText variant="tabularHeadline" style={styles.value}>
            {offsetDeg > 0 ? `+${offsetDeg}°` : `${offsetDeg}°`}
          </ThemedText>
          <Button
            variant="secondary"
            size="sm"
            title="+"
            disabled={offsetDeg >= USER_OFFSET_LIMIT_DEG}
            onPress={() => setOffsetDeg(offsetDeg + TRIM_STEP_DEG)}
          />
          {offsetDeg !== 0 && (
            <Button variant="secondary" size="sm" title={t('settings.reset')} onPress={() => setOffsetDeg(0)} />
          )}
        </View>
      </Card>

      <Card style={styles.card}>
        <ThemedText variant="subhead">{t('settings.declinationTitle')}</ThemedText>
        <ThemedText variant="caption">
          {loc.declinationDeg !== null
            ? t('settings.declinationAuto', { value: `${Math.abs(loc.declinationDeg).toFixed(1)}°` })
            : t('settings.declinationManualHint')}
        </ThemedText>
        <View style={styles.row}>
          <Button
            variant="secondary"
            size="sm"
            title="−"
            disabled={manualDeclinationDeg <= -MANUAL_DECLINATION_LIMIT_DEG}
            onPress={() => setManualDeclinationDeg(manualDeclinationDeg - TRIM_STEP_DEG)}
          />
          <ThemedText variant="tabularHeadline" style={styles.value}>
            {manualDeclinationDeg > 0 ? `+${manualDeclinationDeg}°` : `${manualDeclinationDeg}°`}
          </ThemedText>
          <Button
            variant="secondary"
            size="sm"
            title="+"
            disabled={manualDeclinationDeg >= MANUAL_DECLINATION_LIMIT_DEG}
            onPress={() => setManualDeclinationDeg(manualDeclinationDeg + TRIM_STEP_DEG)}
          />
          {manualDeclinationDeg !== 0 && (
            <Button
              variant="secondary"
              size="sm"
              title={t('settings.reset')}
              onPress={() => setManualDeclinationDeg(0)}
            />
          )}
        </View>
        <View style={styles.row}>
          {DECLINATION_PRESETS.map((d) => (
            <Button
              key={d}
              variant={manualDeclinationDeg === d ? 'primary' : 'secondary'}
              size="sm"
              title={`+${d}°`}
              onPress={() => setManualDeclinationDeg(d)}
            />
          ))}
        </View>
      </Card>

      <ThemedText variant="caption" style={styles.footer}>
        {t('settings.version', { version: '1.0.0 (1)' })}
      </ThemedText>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.systemBackground },
    root: {
      flexGrow: 1,
      backgroundColor: colors.systemBackground,
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      paddingTop: spacing.xxl,
    },
    card: { gap: spacing.xs, width: '100%' },
    /**
     * Buton satırları. `stretch` yükseklikleri eşitler, `flexWrap` dar ekranda
     * taşmayı engeller. `columnGap`/`rowGap` dar ekranda yatay boşluğu kısarak
     * metin için yer bırakır (kullanıcı fotoğrafındaki iki satıra bölünme).
     */
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      flexWrap: 'wrap',
      columnGap: spacing.sm,
      rowGap: spacing.sm,
    },
    value: { minWidth: 52, textAlign: 'center', alignSelf: 'center' },
    hintWarn: { color: colors.systemOrange },
    footer: { textAlign: 'center', color: colors.secondaryLabel, borderRadius: radius.md },
  });
