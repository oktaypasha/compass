import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Merkezi kart — içerik için `children` alır (composition over configuration). */
export function Card({ children, style }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.secondarySystemBackground,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          padding: spacing.md,
          boxShadow: shadows.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
