import type { TextStyle } from 'react-native';
import { colors } from './colors';

/**
 * Platform rampasına aynalanmış adlandırılmış metin stilleri. Ekranlar ham
 * fontSize yazmaz.
 *
 * ⚠️ `color` ALANI YOK: renkler tema bağlamından gelir (bkz. theme-provider).
 * `ThemedText` rengi `tier` haritasından basar. Modül seviyesinde sabit renk
 * tutmak karanlık modu imkânsız kılıyordu.
 */
/**
 * Taban punto. Ekranlar bunları doğrudan değil, `scaled()` ile kullanır
 * (`useResponsiveScale().scale`); sabit değerler sadece referans tabanıdır.
 */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' },
  /** Ekran başlığı — hamburger'ın yanında sığacak kadar küçük (kullanıcı isteği). */
  title: { fontSize: 19, fontWeight: '600' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' },
  subhead: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
  /** Sayılar: rakam genişliği sabitlenir, titreme engellenir. */
  tabularHeadline: {
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  /** Kadranın altındaki büyük derece okuması (ör. "348°"). */
  reading: {
    fontSize: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  /** Derecenin yanındaki uluslararası yön harfi (ör. "NE"). */
  readingLabel: { fontSize: 20, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Hangi rengi basacağı: birincil (koyu) metin mi, ikincil mi. */
export const tier: Record<TypeVariant, 'label' | 'secondaryLabel'> = {
  largeTitle: 'label',
  title: 'label',
  headline: 'label',
  body: 'label',
  tabularHeadline: 'label',
  reading: 'label',
  readingLabel: 'label',
  subhead: 'secondaryLabel',
  caption: 'secondaryLabel',
};

/** Ekranların kullandığı sabit (tema bağımsız) marka renkleri. */
export const brand = {
  needleNorth: colors.needleNorth,
  onTint: '#ffffff',
} as const;
