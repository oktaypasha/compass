import type { TextStyle } from 'react-native';
import { colors } from './colors';

/** Platform rampasına aynalı adlandırılmış metin stilleri. Ekranlar fontSize yazmaz. */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700', color: colors.label },
  title: { fontSize: 22, fontWeight: '600', color: colors.label },
  headline: { fontSize: 17, fontWeight: '600', color: colors.label },
  body: { fontSize: 17, fontWeight: '400', color: colors.label },
  subhead: { fontSize: 15, fontWeight: '400', color: colors.secondaryLabel },
  caption: { fontSize: 12, fontWeight: '400', color: colors.secondaryLabel },
  /** Sayaçlar: rakam genişliği sabitlenir, titreme engellenir. */
  tabularHeadline: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.label,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;
