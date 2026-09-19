import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme';
import { ThemedText } from '../themed-text';

const variants = {
  primary: { backgroundColor: colors.systemBlue, color: colors.onTint },
  secondary: { backgroundColor: colors.secondarySystemBackground, color: colors.label },
} as const;

const sizes = {
  sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  md: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  lg: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: variants[variant].backgroundColor,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          alignItems: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          ...sizes[size],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variants[variant].color as string} />
      ) : (
        <ThemedText variant="headline" style={{ color: variants[variant].color }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}
