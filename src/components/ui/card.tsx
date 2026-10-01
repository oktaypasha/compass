import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, shadows, spacing, useTheme } from '../../theme';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Merkezi kart — içerik için `children` alır (composition over configuration). */
export function Card({ children, style }: Props) {
  const { colors } = useTheme();
  const themed = useMemo(
    () =>
      StyleSheet.create({
        base: {
          backgroundColor: colors.secondarySystemBackground,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          padding: spacing.md,
          boxShadow: shadows.card,
        },
      }).base,
    [colors],
  );
  return <View style={[themed, style]}>{children}</View>;
}
