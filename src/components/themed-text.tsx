import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';
import { scaled, tier, type, type TypeVariant, useResponsiveScale, useTheme } from '../theme';

interface Props extends TextProps {
  variant?: TypeVariant;
  /**
   * `numberOfLines` + `adjustsFontSizeToFit` uygulansın mı?
   *
   * Varsayılan `true`: dar ekranda başlıkların iki satıra bölünmesi buton
   * yüksekliklerini eşitsizleştiriyordu (kullanıcı fotoğrafı). Tek satıra kilitli
   * metin sığmazsa punto küçülür, en fazla %75'e kadar; altına inilmez.
   *
   * Adres ve koordinat gibi BİLEREK çok satıra izin verilen alanlar `false`
   * vererek bu korumayı kapatır.
   */
  fit?: boolean;
  children: ReactNode;
}

/**
 * Ekranlar ham fontSize yazmaz — bu component + theme üzerinden geçer.
 * Renk `tier` haritasından gelir (modül seviyesi sabit renk karanlık modu
 * imkânsız kılıyordu).
 *
 * ⚠️ `adjustsFontSizeToFit` React Native'de YALNIZCA iOS'ta çalışır; Android'de
 * yok sayılır. Bu yüzden Android'in garantisi `numberOfLines` + çağıranın
 * verdiği ölçekli font boyutudur. İkisi birlikte kullanılır.
 */
export function ThemedText({ variant = 'body', fit = true, style, ...props }: Props) {
  const { colors } = useTheme();
  // Ekran genişliğine göre ölçekleme. Çağıran kendi `fontSize`'ını verirse o
  // (genellikle zaten ölçeklenmiş) kazanır; vermezse rampadan ölçeklenmiş basılır.
  const { scale } = useResponsiveScale();
  const flat = StyleSheet.flatten(style);
  const fontSize =
    typeof flat?.fontSize === 'number' ? flat.fontSize : scaled(type[variant].fontSize, scale);
  return (
    <Text
      numberOfLines={fit ? 1 : undefined}
      adjustsFontSizeToFit={fit ? true : undefined}
      minimumFontScale={fit ? 0.75 : undefined}
      ellipsizeMode={fit ? 'tail' : undefined}
      {...props}
      style={[
        type[variant],
        { color: colors[tier[variant]], fontSize, lineHeight: Math.round(fontSize * 1.3) },
        style,
      ]}
    />
  );
}
