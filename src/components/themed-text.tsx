import type { ReactNode } from 'react';
import { Text, type TextProps } from 'react-native';
import { type } from '../theme';

interface Props extends TextProps {
  variant?: keyof typeof type;
  children: ReactNode;
}

/** Ekranlar ham fontSize yazmaz — bu component + theme üzerinden geçer. */
export function ThemedText({ variant = 'body', style, ...props }: Props) {
  return <Text style={[type[variant], style]} {...props} />;
}
