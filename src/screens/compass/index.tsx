import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { CompassDial } from '../../components/compass-dial';
import { ThemedText } from '../../components/themed-text';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useCompassHeading } from '../../hooks/use-compass-heading';
import '../../i18n';
import { colors, spacing } from '../../theme';
import { cardinalLabel } from '../../utils/heading';

/**
 * Pusula ekranı — ekran gövdesi (route değil, `App.tsx` render eder).
 * Yeniden-render yalnızca kısılmış değerlerde olur (5 Hz); kadranın kendisi
 * UI-thread shared value ile döner ve React render'ına hiç dokunmaz.
 */
export function CompassScreen() {
  const { t, i18n } = useTranslation();
  const { headingSV, headingDeg, cardinalIdx, fieldStrength, level, simulated } =
    useCompassHeading();

  void cardinalIdx;

  return (
    <View style={styles.root}>
      <ThemedText variant="largeTitle" style={styles.title}>
        {t('app.title')}
      </ThemedText>

      <CompassDial headingSV={headingSV} locale={i18n.language} />

      <View style={styles.readout}>
        <ThemedText variant="largeTitle" style={styles.deg} selectable>
          {t('compass.heading', { deg: headingDeg })}
        </ThemedText>
        <ThemedText variant="title">{cardinalLabel(headingDeg, i18n.language)}</ThemedText>
      </View>

      <Card style={styles.status}>
        <ThemedText variant="subhead">
          {t('compass.accuracy', { level: `${fieldStrength} µT` })}
        </ThemedText>
        {!level && !simulated && (
          <ThemedText variant="caption">{t('compass.levelHint')}</ThemedText>
        )}
        {fieldStrength > 80 && !simulated && (
          <ThemedText variant="caption">{t('compass.calibrating')}</ThemedText>
        )}
        {simulated && <ThemedText variant="caption">{t('compass.simulated')}</ThemedText>}
      </Card>

      <View style={styles.lang}>
        <Button
          variant={i18n.language.startsWith('tr') ? 'primary' : 'secondary'}
          size="sm"
          title="TR"
          onPress={() => void i18n.changeLanguage('tr')}
        />
        <Button
          variant={i18n.language.startsWith('en') ? 'primary' : 'secondary'}
          size="sm"
          title="EN"
          onPress={() => void i18n.changeLanguage('en')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.systemBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  title: {
    marginBottom: spacing.sm,
  },
  readout: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  deg: {
    fontVariant: ['tabular-nums'],
  },
  status: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  lang: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
