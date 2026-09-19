/** Uygulama geneli hareket süreleri — kadran animasyonu bu ölçeğe uyar. */
export const motion = {
  fast: 150,
  base: 250,
  slow: 400,
} as const;

/** Pusula ayarları — tek yerden akort edilir. */
export const compassMotion = {
  /** Sensör örnekleme aralığı (ms). 20ms ≈ 50Hz: 16ms kadar gürültülü değil, 32ms kadar kesikli değil. */
  sampleIntervalMs: 20,
  /** Manyetometre düzeltme kazancı (complementary filter α). */
  fusionAlpha: 0.05,
  /** Son yumuşatma (sin/cos EMA β). Küçük = daha smooth, daha gecikmeli. */
  emaAlpha: 0.12,
  /** Çıktı ölü bandı (derece): altındaki oynamalar UI'ya yazılmaz — 1-2° zıplamayı öldürür. */
  deadbandDeg: 0.4,
} as const;
