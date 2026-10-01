import { useWindowDimensions } from 'react-native';

/**
 * EKRAN BOYUTUNA GÖRE ÖLÇEKLEME.
 *
 * Sorun: sabit `fontSize` + sabit `padding` dar ekranda taşar. Kullanıcı
 * fotoğrafında "Konumu paylaş" butonu iki satıra bölünüp butonu daha YÜKSEK
 * gösterdi; komşu buton tek satırda kalınca hizasız bir çift oluştu. Bu, bir
 * "responsive" uygulamada kabul edilemez: düğmeler her ekranda tek satır, aynı
 * yükseklikte kalmalı.
 *
 * ⚠️ `adjustsFontSizeToFit` tek başına ÇÖZÜM DEĞİLDİR:
 * React Native'de bu özellik **yalnızca iOS'ta** çalışır, Android'de yok sayılır.
 * Kullanıcının sorunu Android'deydi; yalnız o prop eklemek hiçbir şeyi
 * düzeltmezdi. Bu yüzden iki katman birlikte kuruldu:
 *
 *   1. `adjustsFontSizeToFit` + `numberOfLines={1}` → iOS'ta otomatik küçültme,
 *      ASLA ikinci satıra geçmez.
 *   2. `useResponsiveScale()` → Android dahil her platformda genişliğe göre
 *      baştan doğru puntoda basmak.
 *
 * Ölçekleme tabanı: tasarım genişliği 390 dp (iPhone 14 referansı). Bu
 * genişlikte `scale === 1`. Dar ekranda küçülür, tablette büyür ve bir üst
 * sınıra dayanır — böylece tablette devasa, çok küçük ekranda okunamaz metin
 * oluşmaz.
 */
export const DESIGN_WIDTH = 390;

/** Bu değerin altına küçültmeyiz: alt sınır okunabilirlik içindir. */
export const MIN_SCALE = 0.82;
/** Üst sınır: tablette yazılar sınırsız büyümesin. */
export const MAX_SCALE = 1.28;

export interface ResponsiveScale {
  /** Genişliğe göre çarpan (0.82…1.28). */
  scale: number;
  /** Kullanılabilir genişlik (dp). */
  width: number;
  /** Kullanılabilir yükseklik (dp). */
  height: number;
  /** Dar ekran (ör. < 360 dp): metinlerin daha da sıkılaştırılması gerekir. */
  isCompact: boolean;
  /** Tablet (kısa kenar ≥ 600 dp, Android'in mdpi-ish sınıflandırması). */
  isTablet: boolean;
  /**
   * Okuma genişliği sınırı (dp). Tablette sınırsız genişleyen bir sütun
   * satırları okunmaz hale getirir; içerik ortalanır.
   */
  contentMaxWidth: number;
}

export function useResponsiveScale(): ResponsiveScale {
  const { width, height } = useWindowDimensions();
  const shortSide = Math.min(width, height);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, width / DESIGN_WIDTH));
  return {
    scale,
    width,
    height,
    isCompact: shortSide < 360,
    isTablet: shortSide >= 600,
    contentMaxWidth: 520,
  };
}

/** Sabit punto yerine ölçekli punto üretir. */
export function scaled(base: number, scale: number): number {
  return Math.round(base * scale * 10) / 10;
}