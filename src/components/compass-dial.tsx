import { memo, useMemo } from 'react';
import { StyleSheet, View, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';

/** `react-native-svg` metnini Reanimated ile döndürmek için. */
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

/**
 * Pusula kadranı — sade, referans görsele bire bir, TEMA FARKINDAZ.
 *
 * Tasarım sözleşmesi (kullanıcı referansı + sonraki geri bildirim):
 * - **Siyah yüz YOK.** Önceki sürümde kadranın arkasında sabit siyah daire vardı;
 *   açık temada ekranın ortasında kara bir leke gibi duruyordu. Artık yüz şeffaf,
 *   tüm çizgi/harf/rakam **temanın metin renginde** (koyu temada beyaz, açık
 *   temada siyah) → her iki temada okunur.
 * - Metalik çember, yıldız, gül deseni yok.
 * - Taksimat 1°'de bir; 5°/10°/30°'de uzayan ve kalınlaşan çizgiler.
 * - Derece rakamları halkanın dışında, 30° adımla (0…330), düz durur.
 * - **Kırmızı kuzey oku ve "0" rakamı tam kuzeyde (0°)**, yanal kaydırma YOK:
 *   dışarıdan içe sıralama 0° ekseninde: halka → kırmızı ok → indeks çizgisi →
 *   "0" rakamı. (Önceki sürümde ikisi de −15°'ye kaydırılmıştı; kullanıcı
 *   "kırmızı ok yanlış yerde duruyor, üstünde sıfır yazıyor" dedi.)
 * - Ortada su terazisi tablası + ince sabit artı; üstünde küçük, hareketli ve
 *   RENKLE doğrulanan gösterge.
 *
 * Ölçüler 400 birimlik çizim alanına göre verilir ve `size` ile ölçeklenir
 * (viewBox). TÜM yarıçaplar 200'den küçük olmalı: dışarıda kalan hiçbir şey
 * yoktur (aksi halde SVG sessizce kırpıyor).
 */
export const DIAL_SIZE = 400;

const C = DIAL_SIZE / 2;

/** Taksimat halkanının dış kenarı. */
const R_TICK_OUTER = 150;
/**
 * Derece rakamlarının yarıçapı — halkanın ~1,24 katı (referans 1,35; kullanıcı
 * "rakamlarla kadran arası fazla açık" dediği için bilinçli olarak daraltıldı).
 */
const R_NUM = 186;
/** N/E/S/W harflerinin yarıçapı (halkanın ~0,75 katı). */
const R_CARD = 112;
/** Ortadaki su terazisi tablası. */
const R_CENTER = 42;
/** Sabit artı işaretinin yarı uzunluğu (tablanın dışına taşar). */
const R_CROSS = 84;
/** Sabit indeks çizgisi: kırmızı okun hemen dışında, "0" rakamının hemen içinde. */
const R_INDEX_INNER = 166;
const R_INDEX_OUTER = 180;
/** Kırmızı kuzey oku: halkanın hemen dışında, tam 0°. */
const R_TRIANGLE = 162;
/** Derece adımı (yalnızca 0…330; 360 ≡ 0). */
const DEG_STEP = 30;

/** Kırmızı kuzey oku her iki temada da kırmızı kalır. */
const NORTH_RED = '#e5484d';

const CARDINALS: { angle: number; label: string }[] = [
  { angle: 0, label: 'N' },
  { angle: 90, label: 'E' },
  { angle: 180, label: 'S' },
  { angle: 270, label: 'W' },
];

/**
 * Taksimat kademeleri: büyük adım hem daha uzun hem daha kalın.
 *
 * Kullanıcı geri bildirimi: "taksimat çizgileri biraz kısa duruyor, onları biraz
 * daha uzat; ana yön çizgilerini biraz kalınlaştır, daha belirgin olsun."
 * Referans fotoğrafta bant kalın, kademeler arası fark az: ince çizgi ≈ halka
 * yarıçapının %9'u, 30°'deki ana çizgi ≈ %17'si.
 */
const TICK_TIERS = [
  { step: 1, len: 13, w: 0.8 },
  { step: 5, len: 16, w: 1 },
  { step: 10, len: 19, w: 1.5 },
  { step: 30, len: 25, w: 2.2 },
] as const;

interface Props {
/**
   * Kadran kare boyutu (dp). Varsayilan DIAL_SIZE.
   *
   * Neden prop: dikeyde sığmayınca kadran küçülür. Sadece sarmalayıcıyı
   * küçültmek yetmez — SVG kendi boyutunda çizmeye devam eder ve altındaki
   * metnin üstüne taşar.
   */
  size?: number;
  /** Sarmalanmamış sürekli açı — UI thread'de rotate'e bağlanır, re-render üretmez. */
  headingSV: SharedValue<number>;
}

function polar(r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) / 180) * Math.PI;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

/** `angle` derecesindeki çizgi için, `R_TICK_OUTER`'dan içe doğru noktalar. */
function tick(angle: number, len: number): { x1: number; y1: number; x2: number; y2: number } {
  const outer = polar(R_TICK_OUTER, angle);
  const inner = polar(R_TICK_OUTER - len, angle);
  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
}

/**
 * Taksimat listesi (1°…359°). En büyük adımda bölünen kademe seçilir, yani
 * 30° hem 30 hem 10 hem 5 hem 1'in kuralına girer ama en uzun çizgiyi alır.
 */
export const TICKS: readonly { angle: number; len: number; w: number }[] = Object.freeze(
  Array.from({ length: 360 }, (_, angle) => {
    let tier: (typeof TICK_TIERS)[number] = TICK_TIERS[0];
    for (const t of TICK_TIERS) if (angle % t.step === 0) tier = t;
    return { angle, len: tier.len, w: tier.w };
  }),
);

/**
 * Kadran geometri yarıçapları — DIŞA AÇIK.
 *
 * Neden: kontrast/renk değişiklikleri geometriyi kaydırmamalı (kullanıcı
 * referans görseli sabit), ama "değiştirmedim" demek test edilemez. Yarıçaplar
 * dışa açık olduğunda `dial-contrast.test.ts` ölçüleri kilitleyebilir.
 */
export const DIAL_GEOMETRY = {
  /** Taksimat halkanın dış kenarı. */
  tickOuter: R_TICK_OUTER,
  /** Derece rakamlarının yarıçapı. */
  numeral: R_NUM,
  /** N/E/S/W harflerinin yarıçapı. */
  cardinal: R_CARD,
  /** Merkez su terazisi tablası. */
  center: R_CENTER,
  /** Sabit artı işaretinin yarı uzunluğu. */
  cross: R_CROSS,
  /** Sabit indeks çizgisinin dış ucu. */
  indexOuter: R_INDEX_OUTER,
} as const;

/** Halka dışındaki derece rakamları: 0…330, 30° adımla. 360 asla basılmaz. */
export const DEGREE_LABELS: readonly number[] = Object.freeze(
  Array.from({ length: 360 / DEG_STEP }, (_, i) => i * DEG_STEP),
);

/**
 * Kadran etiketi — konumu dönen yüzle birlikte döner, KENDİSİ DİZİ DURUR.
 *
 * Neden ayrı bileşen: etiket iki şeyi aynı anda yapmak zorunda — yarıçapı
 * `angle` konumuna taşınır (dönen katmanda), ama referans görselde rakamlar ve
 * N/E/S/W **tatar dışında düz** durur. Düzeltme `transform: rotate(+heading)`:
 * katman `-heading` ile dönerken etiket `+heading` ile geri döner.
 *
 * `useAnimatedProps` her etiket için ayrı bir çağrıdır (hook döngüde çağrılamaz),
 * bu yüzden etiket bileşeni. Hepsi UI thread'de çalışır, React render'ı yok.
 */
const UprightLabel = memo(function UprightLabel({
  headingSV,
  label,
  angle,
  radius,
  fontSize,
  fill,
  weight,
  dy,
}: {
  headingSV: SharedValue<number>;
  label: string;
  angle: number;
  radius: number;
  fontSize: number;
  fill: string;
  weight: TextStyle['fontWeight'];
  dy: number;
}) {
  const p = polar(radius, angle);
  const ox = p.x;
  const oy = p.y + dy;
  /*
   * Nokta etrafında döndürme, `origin` prop'una BAKMAKDAN: SVG'de
   * `translate(P) rotate(θ) translate(-P)` dizisi her yorumda aynı sonucu
   * verir. (Denendi: `origin="x, y"` metni yerinden kaydırıyordu — etiketler
   * halkaya yapışıp kadranın altı taşıp kırpılıyordu.)
   */
  const props = useAnimatedProps(() => ({
    x: ox,
    y: oy,
    transform: [
      { translateX: ox },
      { translateY: oy },
      { rotate: `${headingSV.get()}deg` },
      { translateX: -ox },
      { translateY: -oy },
    ],
  }));
  return (
    <AnimatedSvgText
      animatedProps={props}
      fontSize={fontSize}
      fontWeight={weight}
      textAnchor="middle"
      fill={fill}
    >
      {label}
    </AnimatedSvgText>
  );
});

/**
 * Kadran — dönen yüz + sabit indeks.
 *
 * Dönüş yalnızca `transform: rotate` (layout pass yok). Sarmalanmamış açı
 * doğrudan verilir, 359.9→0.1 sıçraması olmaz.
 */
export const CompassDial = memo(function CompassDial({ headingSV, size = DIAL_SIZE }: Props) {
  /*
   * ⚠️ Kadran mürekkebi artık temadan GELİR ama `label` DEĞİLDİR.
   *
   * Kullanıcı geri bildirimi (Samsung, her iki tema): "kadran renkleri arka plan
   * içinde yutuluyor, sönük kaldı, zor seçiliyor." Sebep: ince çizgiler ve
   * rakamlar `colors.separator` (açık temada `#c6c6c8`) ile çiziliyordu —
   * beyaz zeminde bu neredeyse görünmez. Şimdi:
   *   açık tema → TAM SİYAH (`dialInk: #000000`)
   *   koyu tema → TAM BEYAZ (`dialInk: #ffffff`)
   * Taksimat, rakamlar, N/E/S/W ve indeks çizgisi bu değeri kullanır.
   */
  const { colors } = useTheme();
  const ink = colors.dialInk;
  const inkDim = colors.dialInkDim;
  const plate = colors.dialPlate;
  const stroke = { stroke: ink };

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-headingSV.get()}deg` }],
  }));

  // Kırmızı kuzey oku: tam 0°, dışa bakan uç, halkanın hemen dışında.
  const triangle = useMemo(() => {
    const apex = polar(R_TRIANGLE + 10, 0);
    const left = polar(R_TRIANGLE - 10, -2.8);
    const right = polar(R_TRIANGLE - 10, 2.8);
    return `M ${apex.x} ${apex.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
  }, []);

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="image"
      accessibilityLabel="compass-dial"
    >
      {/*
        DÖNEN YÜZ
        ⚠️ Her katman `position: absolute` ve tam kareyi kaplar. Akış içinde
        üç ayrı `<Svg>` yığılırsa (dönen yüz + indeks + merkez) hepsi `size`
        yüksekliğindedir ve `size` yüksekliğindeki kapsayıcıdan TAŞAR: dönen
        yüz yukarı itilir (başlığın üstüne biner), merkez katmanı aşağı
        (düğmelerin üstüne) düşer. Cihazda tam olarak bu oldu.
      */}
      <Animated.View style={[styles.layer, faceStyle]}>
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          /*
           * ⚠️ BURADA İKİ KEZ HATA YAPILDI — canlı ekran görüntüsüyle kanıtlandı.
           *
           * 1. sürüm: `opacity={ready ? 1 : 0.35}`. Amacı "ilk sensör örneği
           * gelene kadar uydurma kuzey gösterme"ydi ve doğru bir niyetti.
           * AMA bir cihazda manyetometre yoksa `ready` KALICI olarak false'dır;
           * o halde kadran sürekli %35 opaklıkta çiziliyordu. Açık temada
           * `#000000 × 0.35` beyaz üzerinde ≈ `#a6a6a6` griye dönüşür — kullanıcı
           * "kadran renkleri arka plan içinde yutuluyor, sönük, zor seçiliyor"
           * diye raporladı ve `dialInk: #000000` düzeltmesi bile işe yaramadı,
           * çünkü opaklık çarpanı rengi eziyordu. Ekran görüntüsündeki soluk
           * kadranın tam matematiksel karşılığı budur.
           *
           * 2. deneme: opaklığı 0.75 yapmak. Bu da yanlış — süsleme değil, ölçüm
           * aracı; eksik veri kadranın okunabilirliğini bozmamalı.
           *
           * DOĞRU ÇÖZÜM: Kadran daima TAM opak. "Veri yok" bilgisi kadranın
           * kendisine değil, derece okumasına ve donanım bildirimine aittir
           * (bkz. `hardware === 'no-magnetometer'` bloğu). Gerekirse taksimata
           * bir "kapalı" göstergesi eklenir — opaklıkla değil.
           */
        >
          {/* Taksimat: 1° / 5° / 10° / 30° kademeleri */}
          {TICKS.map((t) => {
            const p = tick(t.angle, t.len);
            return (
              <Line
                key={`t${t.angle}`}
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                strokeWidth={t.w}
                stroke={ink}
              />
            );
          })}

          {/* Derece rakamları, halkanın dışında, DÜZ durur, 0° tam tepe */}
          {DEGREE_LABELS.map((d) => (
            <UprightLabel
              key={`deg${d}`}
              headingSV={headingSV}
              label={String(d)}
              angle={d}
              radius={R_NUM}
              fontSize={13}
              weight="600"
              dy={5}
              fill={ink}
            />
          ))}

          {/* Kırmızı kuzey oku — TAM 0° */}
          <Path d={triangle} fill={NORTH_RED} />

          {/* N/E/S/W — uluslararası sabit harfler, DİL DEĞİŞMEZ, düz durur */}
          {CARDINALS.map((c) => (
            <UprightLabel
              key={c.label}
              headingSV={headingSV}
              label={c.label}
              angle={c.angle}
              radius={R_CARD}
              fontSize={27}
              weight="700"
              dy={8}
              fill={ink}
            />
          ))}
        </Svg>
      </Animated.View>

      {/* SABİT indeks çizgisi — dönmez, 0° yuvasında durur */}
      <Svg
        style={styles.layer}
        width={size}
        height={size}
        viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
        pointerEvents="none"
      >
        <Line
          x1={polar(R_INDEX_INNER, 0).x}
          y1={polar(R_INDEX_INNER, 0).y}
          x2={polar(R_INDEX_OUTER, 0).x}
          y2={polar(R_INDEX_OUTER, 0).y}
          strokeWidth={3.2}
          strokeLinecap="round"
          {...stroke}
        />
      </Svg>

      {/* SABİT merkez: su terazisi tablası + ince artı işareti çizgileri */}
      <Svg
        style={styles.layer}
        width={size}
        height={size}
        viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
        pointerEvents="none"
      >
        <Circle cx={C} cy={C} r={R_CENTER} fill={plate} />
        <Line x1={C - R_CROSS} y1={C} x2={C + R_CROSS} y2={C} strokeWidth={0.8} stroke={inkDim} />
        <Line x1={C} y1={C - R_CROSS} x2={C} y2={C + R_CROSS} strokeWidth={0.8} stroke={inkDim} />
      </Svg>
    </View>
  );
});

interface LevelProps {
  /** Kadran kare boyutu (dp) — ölçeklenmiş çizim alanı bununla eşleşmeli. */
  size: number;
  /** -1…1 arası normalleştirilmiş eğim (x = sağa, y = ileri). */
  bubbleX: number;
  bubbleY: number;
  /**
   * Telefon düz mü. **Renk bununla belirlenir** — ayrı bir "level" bayrağıyla
   * değil. (Önceden ekrandaki ipucu ile bu renk farklı kaynaklardan
   * geliyordu: telefon eğikken bile gösterge yeşildi.)
   */
  level: boolean;
}

/**
 * Kadranın tam ortasındaki HAREKETLİ su terazisi göstergesi.
 *
 * Neden ayrı bileşen: eğim 5 Hz'de güncellenir; kadranın SVG'si 360 çizgiden
 * oluşuyor, bu değerler kadrana girseydi saniyede 5 kez tüm SVG yeniden
 * kurulurdu.
 *
 * Sabit çapraz çizgiler SVG'de (soluk, ince); burada sadece küçük ve parlak
 * gösterge var — düz durduğunda çaprazın tam ortasına oturur, eğildiğinde
 * kayar. Kırmızı/yeşil rengi "düz mü" sorusunu tek yerde yanıtlar.
 */
export const DialLevel = memo(function DialLevel({ size, bubbleX, bubbleY, level }: LevelProps) {
  const { colors } = useTheme();
  // Merkez tablası da aynı kontrast kuralına uyar (tema token'ı).
  const k = size / DIAL_SIZE;
  const plate = R_CENTER * 2 * k;
  const arm = R_CENTER * 0.62 * k;
  // Tablanın İÇİNDE kalsın: eski sürümde hareket dışarı taşıp "yanlış yerde"
  // duran yeşil bir artı bırakıyordu.
  const travel = R_CENTER * 0.5 * k;
  // "Yeşil" = "merkezde" değişmez kuralı. `isLevelReading` ±2,5°'ye kadar
  // tolerans tanır, dolayısıyla düz sayılan ama henüz kaymış bir telefonda
  // gösterge yeşil kalırken yanda duruyordu ("yeşil artı yanlış yerde").
  // Düz kabul edildiğinde kayma sıfırlanır: ya yeşil ve merkezde, ya kırmızı
  // ve kaymış.
  const dx = level ? 0 : bubbleX * travel;
  const dy = level ? 0 : -bubbleY * travel;
  const color = level ? colors.systemGreen : colors.systemRed;
  return (
    <View
      style={[styles.level, { top: (size - plate) / 2, left: (size - plate) / 2 }]}
      pointerEvents="none"
      accessibilityRole="image"
      accessibilityLabel="compass-level"
    >
      <View
        style={[
          styles.levelPlus,
          {
            width: plate,
            height: plate,
            transform: [{ translateX: dx }, { translateY: dy }],
          },
        ]}
      >
        <View style={[styles.levelH, { width: arm, backgroundColor: color }]} />
        <View style={[styles.levelV, { height: arm, backgroundColor: color }]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  /** Her katman kareyi tam kaplar; akışa katılmaz (taşma olmaz). */
  layer: { position: 'absolute', top: 0, left: 0 },
  level: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  levelPlus: { alignItems: 'center', justifyContent: 'center' },
  levelH: { position: 'absolute', height: 2.5, borderRadius: 2 },
  levelV: { position: 'absolute', width: 2.5, borderRadius: 2 },
});
