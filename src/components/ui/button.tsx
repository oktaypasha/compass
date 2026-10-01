import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme, useResponsiveScale, scaled, type ThemeColors } from '../../theme';
import { ThemedText } from '../themed-text';

/**
 * Varyant renkleri `ThemeColors` anahtarlarıyla tanımlı; `satisfies` sayesinde
 * yazım hatası DERLEME hatası olur. (Önceden `role: 'tint'` gibi geçersiz bir
 * anahtar `as` cast'iyle kaçıyor ve primary buton arka plansız kalıyordu.)
 *
 * `secondary` dolu bir zeminden çok kenarlıktan yaşar: koyu temada
 * `secondarySystemBackground` kart zeminiyle aynı ton olduğu için buton
 * "yutulmuş" görünüyor ve zor seçiliyordu (kullanıcı geri bildirimi).
 * Bu yüzden secondary her zaman 1.5 px kenar + şeffaf zemin alır.
 */
const variants = {
  primary: { bg: 'systemBlue', fg: 'onTint', bordered: false },
  secondary: { bg: 'systemBackground', fg: 'label', bordered: true },
} as const satisfies Record<
  string,
  { bg: keyof ThemeColors; fg: keyof ThemeColors; bordered: boolean }
>;

/** Boyut rampası — göreli birimler, ölçekleme ile birlikte kullanılır. */
const sizes = {
  sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, font: 15 },
  md: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, font: 17 },
  lg: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, font: 19 },
} as const;

interface Props {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

/**
 * Merkezi buton (Reusables felsefesi: copy-paste sahiplenme, variant/size/state
 * kontratı, caller style'ı en sonda birleşir — kimliği değil yerleşimi ezer).
 * Renkler temadan gelir.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  title,
  loading,
  disabled,
  style,
  onPress,
}: Props) {
  const { colors } = useTheme();
  const { scale } = useResponsiveScale();
  const v = variants[variant];
  const sz = sizes[size];
  // ⚠️ Neden ölçekli font + `numberOfLines`: kullanıcı fotoğrafında dar ekranda
  // "Konumu paylaş" butonu İKİ SATIRA bölündü ve buton komşusundan daha yüksek
  // göründü. Sabit puntoda çözüm yok; metin ölçeklenir ve TEK satırda kilitlenir.
  const fontSize = scaled(sz.font, scale);
  // ⚠️ `v.fg` bir RENK ANAHTARIDIR (`'label'`), renk değeri değil. Doğrudan
  // `color: v.fg` yazılırsa RN geçersiz renk alır ve metin tema ne olursa
  // olsun görünmez olur (koyu temada "Haritada aç" / "Konumu paylaş" ve
  // menüdeki ✕ düğmesi). Çözüm: `colors[...]` ile GERÇEK renge çevir.
  const bg = colors[v.bg];
  const fg = colors[v.fg];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          alignItems: 'center',
          // Kenarlık, butonu zeminden ayırır: seçilebilirliği artırır.
          // `separator` kart zemininde fazla soluk kalıyor, bu yüzden
          // `secondaryLabel` (metin tonu) kullanılıyor — belirgin ama bağırmayan.
          borderWidth: v.bordered ? 1.5 : 0,
          borderColor: colors.secondaryLabel,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          paddingVertical: scaled(sz.paddingVertical, scale),
          paddingHorizontal: scaled(sz.paddingHorizontal, scale),
          // ⚠️ `flexShrink: 1` + `minWidth: 0` olmadan flex çocuklar dar ekranda
          // kendi içeriklerinden GENİŞ kalır ve satırı taşırır (butonun
          // komşusunu ezip yazmasının klasik nedeni).
          minWidth: 0,
          flexShrink: 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        /*
         * Üç katmanlı satır güvenliği:
         *  - `numberOfLines={1}`            → asla ikinci satıra geçmez
         *  - `adjustsFontSizeToFit`        → iOS'ta sığmazsa punto küçülür
         *  - `minimumFontScale`            → 0.75 altına İNMEZ (okunabilirlik)
         * Android'de `adjustsFontSizeToFit` çalışmadığı için asıl koruma
         * yukarıdaki ölçekli font + `flexShrink`'tir.
         */
        <ThemedText
          variant="headline"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ color: fg, fontSize, lineHeight: Math.round(fontSize * 1.25) }}
        >
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}
