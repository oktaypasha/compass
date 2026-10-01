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
  /**
   * Son yumuşatma (sin/cos EMA β). v3: 0.12 → 0.18. Küçük β daha yumuşak ama
   * gecikmeli (telefon döndürünce "ağır" hissedilir); 0.18 ~0.2 sn zaman sabitiyle
   * hem akıcı hem de titremez. Değeri DÜŞÜRME: sin/cos uzayında olduğu için
   * 359°→0° sallanması yine de yok.
   */
  emaAlpha: 0.18,
  /**
   * Çıktı ölü bandı (derece). v3: 0.4 → 0.15. 0.4° bandı küçük dönüşleri
   * yutuyordu ("telefonu oynatınca kadran tepki vermiyor" şikâyeti); 0.15°
   * hâlâ 1/4 hücre altı oynamayı UI'ya yazdırmaz ama her hareketi geçirir.
   */
  deadbandDeg: 0.15,
} as const;
