import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Card } from '../../components/ui/card';
import { ThemedText } from '../../components/themed-text';
import { spacing } from '../../theme';

/**
 * Harita yer tutucu — v1'de pasif. Native MapLibre kurulmadan çağrılırsa
 * çökmez, bilgi kartı gösterir. `map-style.ts`'taki aktivasyon planına bak.
 */
export function MapPlaceholder() {
  const { t } = useTranslation();
  return (
    <Card style={styles.card}>
      <ThemedText variant="headline">{t('settings.trueNorth')}</ThemedText>
      <View style={styles.gap} />
      <ThemedText variant="caption">MapLibre · OpenStreetMap — {t('compass.simulated')}</ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
  },
  gap: {
    height: spacing.xs,
  },
});
