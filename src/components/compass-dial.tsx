import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

const SIZE = 320;
const C = SIZE / 2;
const R_TICK_OUTER = 150;
const R_TICK_MAJOR = 128;
const R_TICK_MINOR = 138;
const R_LABEL = 104;

interface RoseMark {
  angle: number;
  major: boolean;
}

function useTicks(): RoseMark[] {
  return useMemo(
    () =>
      Array.from({ length: 72 }, (_, i) => ({
        angle: i * 5,
        major: i % 6 === 0,
      })),
    [],
  );
}

interface Props {
  /** Sarmalanmamış sürekli açı — UI thread'de rotate'e bağlanır, re-render üretmez. */
  headingSV: SharedValue<number>;
  locale: string;
}

/**
 * Pusula gülü: ham SVG + tek `rotate` transformu.
 * - Dönüş SADECE transform'dur (layout pass yok) → 60fps.
 * - Kadran başlık yönünün tersine döner; üstteki sabit çentik güncel yönü gösterir.
 * - İbre ayrı katmanda kuzey kırmızısı; metinler `tabular-nums` ile titremez.
 */
export const CompassDial = memo(function CompassDial({ headingSV, locale }: Props) {
  const ticks = useTicks();

  const roseStyle = useAnimatedStyle(() => ({
    // Sarmalanmamış değer doğrudan verilir: 359.9→0.1 sıçraması yaşanmaz.
    transform: [{ rotate: `${-headingSV.get()}deg` }],
  }));

  const mainMarks = useMemo(() => {
    const north = locale.startsWith('tr') ? 'K' : 'N';
    const east = locale.startsWith('tr') ? 'D' : 'E';
    const south = locale.startsWith('tr') ? 'G' : 'S';
    const west = locale.startsWith('tr') ? 'B' : 'W';
    return [
      { angle: 0, label: north, hot: true },
      { angle: 90, label: east, hot: false },
      { angle: 180, label: south, hot: false },
      { angle: 270, label: west, hot: false },
    ];
  }, [locale]);

  const degrees = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 30), []);

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel="compass-dial">
      {/* Sabit üst çentik */}
      <View style={styles.lubber} />
      <Animated.View style={roseStyle}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={C} cy={C} r={R_TICK_OUTER} fill="none" strokeWidth={1.5} stroke={colors.dialTick} />
          {ticks.map((t) => {
            const rad = ((t.angle - 90) / 180) * Math.PI;
            const r1 = t.major ? R_TICK_MAJOR : R_TICK_MINOR;
            return (
              <Line
                key={t.angle}
                x1={C + r1 * Math.cos(rad)}
                y1={C + r1 * Math.sin(rad)}
                x2={C + R_TICK_OUTER * Math.cos(rad)}
                y2={C + R_TICK_OUTER * Math.sin(rad)}
                strokeWidth={t.major ? 2.5 : 1}
                stroke={t.angle === 0 ? colors.needleNorth : colors.dialTick}
              />
            );
          })}
          {degrees.map((d) => {
            if (d % 90 === 0) return null;
            const rad = ((d - 90) / 180) * Math.PI;
            return (
              <SvgText
                key={d}
                x={C + R_LABEL * Math.cos(rad)}
                y={C + R_LABEL * Math.sin(rad) + 5}
                fontSize={13}
                textAnchor="middle"
                fill={colors.dialTick}
              >
                {d}°
              </SvgText>
            );
          })}
          <G>
            {mainMarks.map((m) => {
              const rad = ((m.angle - 90) / 180) * Math.PI;
              return (
                <SvgText
                  key={m.label}
                  x={C + (R_LABEL - 22) * Math.cos(rad)}
                  y={C + (R_LABEL - 22) * Math.sin(rad) + 9}
                  fontSize={26}
                  fontWeight="700"
                  textAnchor="middle"
                  fill={m.hot ? colors.needleNorth : colors.label}
                >
                  {m.label}
                </SvgText>
              );
            })}
          </G>
          {/* Merkez ibre: kuzey yarısı kırmızı */}
          <Polygon
            points={`${C},${C - 96} ${C + 9},${C} ${C},${C + 96} ${C - 9},${C}`}
            fill={colors.needleSouth}
          />
          <Polygon points={`${C},${C - 96} ${C + 9},${C} ${C - 9},${C}`} fill={colors.needleNorth} />
          <Circle cx={C} cy={C} r={10} fill={colors.systemBackground} stroke={colors.dialTick} strokeWidth={1.5} />
          <Circle cx={C} cy={C} r={3.5} fill={colors.needleNorth} />
        </Svg>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lubber: {
    position: 'absolute',
    top: -6,
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.needleNorth,
    zIndex: 2,
  },
});
