import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompassDial, DIAL_SIZE, DialLevel } from '../../components/compass-dial';
import { ThemedText } from '../../components/themed-text';
import { Button } from '../../components/ui/button';
import type { CompassState } from '../../hooks/use-compass-heading';
import type { LocationInfo } from '../../hooks/use-location-info';
import { radius, scaled, spacing, useResponsiveScale, useTheme, type ThemeColors } from '../../theme';
import { displayDegrees, directionName, isLevelReading } from '../../utils/heading';
import { buildShareMessage, geoUri } from '../../utils/place';

/** Bu alt sınırın altına düşerse sayfa kayar (kadran okunmaz hale gelir). */
const DIAL_MIN = 230;

/**
 * Pusula ekranı — ekran gövdesi (route değil, `App.tsx` render eder).
 *
 * Düzen (kullanıcı isteği): güneş saatleri → sade kadran (ortasında su terazisi)
 * → derece okuması → açık adres (küçük font) → koordinat → haritada aç / paylaş.
 *
 * Yeniden-render yalnızca kısılmış değerlerde olur (5 Hz); kadranın kendisi
 * UI-thread shared value ile döner ve React render'ına hiç dokunmaz.
 */
interface Props {
  /** Durum kabukta (App.tsx) yaşıyor: tek sensör aboneliği. */
  compass: CompassState;
  loc: LocationInfo;
}

export function CompassScreen({ compass, loc }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const {
    headingSV,
    headingDeg,
    ready,
    fieldStrength,
    fieldQuality,
    sensorAccuracy,
    pose,
    bubble,
    simulated,
    source,
    reference,
    offsetDeg,
    hardware,
  } = compass;

  // Kadran boyutu: sabit sayı DEĞİL, ölçülür.
  //
  // Neden: ekrana sığdırmak için `window.height - CHROME_DP` tahmini kullandık
  // ve cihazda üst üste iki kez yanlış çıktı (butonlar navigasyon çubuğunun
  // altında kaldı). Tahmin yerine kadranın kendi alanı `flex: 1` ile ayrılıyor
  // ve `onLayout` ile gerçek kare kenarı ölçülüyor — her cihazda kendiliğinden
  // doğru, hem de satır yükseklikleri değişse bile.
  const insets = useSafeAreaInsets();
  const [dialBox, setDialBox] = useState(0);

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resp = useResponsiveScale();

  /**
   * Okuma genişliği sınırı. Tablette sınırsız büyüyen tek sütun satırları
   * okunmaz hale getiriyor; 520 dp üstü ortalanıyor (iPad Pro dahil).
   * `width: '100%' + maxWidth` birlikte: küçük ekranda %100'e, büyükte sınıra
   * uyar. Yalnız `maxWidth` dar ekranda bir şey çözmez.
   */
  const contentWidth = { width: '100%' as const, maxWidth: resp.contentMaxWidth };

  const levelOk = isLevelReading(bubble.pitchDeg, bubble.rollDeg);

  const locationText = (() => {
    switch (loc.status) {
      case 'locating':
        return t('location.locating');
      case 'denied':
        return t('location.denied');
      case 'unavailable':
        return t('location.unavailable');
      case 'ready':
      case 'idle':
      default:
        return loc.addressLine ?? loc.coordinateLine ?? t('location.waiting');
    }
  })();

  const canShare = loc.latitude !== null && loc.longitude !== null;

  return (
    <ScrollView
      style={styles.scroll}
      // Alt sekme çubuğu kalktığı için sistem navigasyon çubuğu payı artık
      // bu ekranın işi: aksi halde durum satırı ve butonlar çubuğun altında kalır.
      contentContainerStyle={[
        styles.root,
        contentWidth,
        { paddingBottom: insets.bottom + scaled(spacing.md, resp.scale) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Başlık artık kabukta (App.tsx): hamburger + "Mergen Compass". */}

      {/* Gün doğumu / batımı — yerel saat, cihaz saat dilimi. Konum yoksa "—". */}
      <View style={styles.sunRow} accessibilityRole="text">
        <View style={styles.sunItem}>
          <ThemedText variant="caption">{t('sun.sunrise')}</ThemedText>
          <ThemedText variant="headline" style={styles.sunTime}>
            {loc.sunrise ?? '—'}
          </ThemedText>
        </View>
        <View style={styles.sunDivider} />
        <View style={styles.sunItem}>
          <ThemedText variant="caption">{t('sun.sunset')}</ThemedText>
          <ThemedText variant="headline" style={styles.sunTime}>
            {loc.sunset ?? '—'}
          </ThemedText>
        </View>
      </View>

      {/*
        Kadran alanı: esnek (flex: 1), gerçek kare kenarı `onLayout` ile
        ölçülür. İçerik sığmazsa alan `minHeight`'a düşer ve sayfa kayar.
      */}
      <View
        style={styles.dialArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setDialBox(Math.max(0, Math.min(width, height, DIAL_SIZE)));
        }}
      >
        {dialBox > 0 && (
          /*
           * ⚠️ Bu SATIR olmadan su terazisi kayar. `DialLevel` `position:
           * absolute` kullanıyor; konum bağlamı en yakın konumlanmış ata
           * kutuya göre çözülür. Doğrudan `dialArea`'ya yazılırsa o kutu
           * EKRAN GENİŞLİĞİNDE (360 dp) ve kadran ortalanmışken gösterge
           * `left: (size - plate)/2` ile sola kayıyordu: "yeşil ama merkezden
           * kayık" ve sabit çapraz işaretin üstüne binmiyordu.
           * Kapsayıcı kadranla BİREBİR aynı boyutta olmalı.
           */
          <View style={[styles.dialBox, { width: dialBox, height: dialBox }]}>
            <CompassDial headingSV={headingSV} size={dialBox} />
            <DialLevel
              size={dialBox}
              bubbleX={bubble.bubbleX}
              bubbleY={bubble.bubbleY}
              level={levelOk}
            />
          </View>
        )}
      </View>

      {/*
        Derece okuması kadranın HEMEN ALTINDA (kullanıcı isteği). Yön adı APP
        DİLİNDE: Türkçe "60° Kuzey". Derece de sarmalanır: 359.6° ekranda
        "0°" görünür, çünkü 360° ≡ 0°.

        ⚠️ `hardware === 'no-magnetometer'` iken derece YAZILMAZ (`—` kalır): o
        telefonlarda kuzey fiziksel olarak tanımsızdır. Uydurma bir açı basmak
        pusula uygulamasının en tehlikeli hatasıdır — kullanıcı yanlış yöne
        gider ve uygulamayı siler. Bunun yerine dürüst açıklama aşağıda.
      */}
      <View style={styles.readingRow} accessibilityRole="text" accessibilityLabel="compass-reading">
        <ThemedText
          variant="reading"
          style={{
            opacity: ready ? 1 : 0.45,
            fontSize: scaled(40, resp.scale),
            lineHeight: scaled(46, resp.scale),
          }}
        >
          {headingDeg === null ? '—' : `${displayDegrees(headingDeg)}°`}
        </ThemedText>
        <ThemedText
          variant="readingLabel"
          style={{ opacity: ready ? 1 : 0.45, fontSize: scaled(20, resp.scale) }}
        >
          {headingDeg === null ? '·' : directionName(headingDeg, t)}
        </ThemedText>
      </View>

      {!levelOk && <ThemedText variant="caption">{t('compass.levelHint')}</ThemedText>}

      {/*
        DONANIM YOKUYSA dürüst açıklama.
        ⚠️ Bu, eski "Simülasyon modu (sensör yok)" satırının yerini alır. Eski
        metin hem yanlıştı (ivmeölçer VAR) hem de uydurma bir kadranın
        altında duruyordu. Şimdi: ne olduğu, neden önemli olduğu (su terazisi
        çalışır) ve ne yapılacağı (başka bir cihazda) net.

        Konum: derece okumasının ÜSTÜNDE — çünkü okuma satırı "—" gösteriyor ve
        nedenini burada açıklamak gerekiyor.
      */}
      {hardware === 'no-magnetometer' && !simulated && (
        <View style={styles.noticeBox}>
          <ThemedText variant="subhead" style={styles.noticeTitle}>
            {t('compass.noMagnetometerTitle')}
          </ThemedText>
          <ThemedText variant="caption" fit={false} style={styles.noticeBody}>
            {t('compass.noMagnetometerBody')}
          </ThemedText>
          <ThemedText variant="caption" fit={false} style={styles.noticeOk}>
            {t('compass.noMagnetometerStillWorks')}
          </ThemedText>
        </View>
      )}

      {/*
        Manyetik / Gerçek seçimi artık ANA ekranda değil, Ayarlar'da
        (kullanıcı isteği): ana ekran saf okuma yüzeyi kalmalı. Sapma bilgisi
        de o ekrana taşındı; burada yalnızca uyarı metni görünür.
      */}
      {reference === 'true' && loc.declinationDeg === null && (
        <ThemedText variant="caption">{t('compass.declinationNoFix')}</ThemedText>
      )}

      {/*
        Adres: kullanıcı isteği — YALNIZCA font küçülür, başka hiçbir şey
        değişmez (hizalama, iki satır, seçilebilirlik aynı). Küçük punto bile
        tek satıra sığmıyorsa alt satırda kalır; `numberOfLines` kısıtlaması
        konulmadı, çünkü o zaman adres kesilirdi.
      */}
      <View style={styles.addressBlock}>
        <ThemedText variant="caption" style={styles.addressText} selectable>
          {locationText}
        </ThemedText>
        {loc.status !== 'ready' && loc.hasFix && (
          <Button variant="secondary" size="sm" title={t('location.retry')} onPress={loc.refresh} />
        )}
        {loc.status === 'ready' && loc.accuracyMeters !== null && (
          <ThemedText variant="caption">±{Math.round(loc.accuracyMeters)} m</ThemedText>
        )}
      </View>

      {/* Koordinat: tek satır, küçük. */}
      <ThemedText variant="caption" style={styles.coordText} selectable>
        {loc.coordinateLine ?? '—'}
      </ThemedText>

      {/*
        İki buton TEK satırda ve EŞİT yükseklikte.
        ⚠️ Kullanıcı fotoğrafındaki hata: dar ekranda "Konumu paylaş" iki satıra
        bölünüp butonu daha yüksek gösteriyordu. Çözüm üç parçalı:
          1. Buton metni TEK satıra kilitli (`numberOfLines` + ölçekli font).
          2. `flex: 1` ikisini eşit genişlikte büyütür.
          3. `alignItems: 'stretch'` → yükseklikler da eşitlenir (varsayılan
             `center` idi; kısa buton uzunun hizasında kalıyordu).
        Tablette iki buton yan yana sığmayacak kadar büyürse alt alta düşer
        (`flexWrap`), ama her biri kendi satırında tam genişlikte.
      */}
      <View style={styles.actionRow}>
        <Button
          variant="secondary"
          size="md"
          style={styles.action}
          title={t('location.openMap')}
          disabled={!canShare}
          onPress={() => {
            if (loc.latitude === null || loc.longitude === null) return;
            void Linking.openURL(geoUri(loc.latitude, loc.longitude, loc.addressLine)).catch(
              () => undefined,
            );
          }}
        />
        <Button
          variant="secondary"
          size="md"
          style={styles.action}
          title={t('location.share')}
          disabled={!canShare}
          onPress={() => {
            if (loc.latitude === null || loc.longitude === null) return;
            void Share.share({
              title: t('location.shareTitle'),
              message: buildShareMessage(
                loc.addressLine,
                loc.latitude,
                loc.longitude,
                loc.accuracyMeters,
              ),
            }).catch(() => undefined);
          }}
        />
      </View>

      {(fieldQuality !== 'normal' || (sensorAccuracy !== null && sensorAccuracy <= 1)) &&
        !simulated && (
          <View style={styles.warnBox}>
            {fieldQuality === 'interference' && (
              <ThemedText variant="caption" style={styles.warnText}>
                {t('compass.interference')}
              </ThemedText>
            )}
            {fieldQuality === 'suspect' && (
              <ThemedText variant="caption" style={styles.warnText}>
                {t('compass.suspectField')}
              </ThemedText>
            )}
            {sensorAccuracy !== null && sensorAccuracy <= 1 && (
              <ThemedText variant="caption" style={styles.warnText}>
                {t('compass.figureEight')}
              </ThemedText>
            )}
          </View>
        )}

      {/*
        Su terazisi artık kadranın merkezinde (`DialLevel`); buradaki ayrı
        büyük daire kaldırıldı — kullanıcı "minik daire ve artı işareti kadranın
        ortasında olsun" dedi.
      */}

      {/*
        Durum satırı: alan şiddeti + kaynak + tutuş + **uygulanan ofset**.

        ⚠️ "Doğruluk: 0 µT" bir ÖLÇÜM DEĞİLDİR — canlı ekran görüntüsünde
        (Expo Go, manyetometresiz telefon) tam olarak bu göründü. Alan şiddeti
        `useState(0)` ile başladığı için sensör hiç veri gelmeden de 0 µT
        yazıyordu; kullanıcı bunu geçerli bir ölçüm sanıyordu. Şimdi:
        manyetometre yoksa alan şiddeti HİÇ yazılmaz; manyetometre var ama
        henüz veri gelmediyse "—" (bilinmiyor) yazılır.
      */}
      <ThemedText variant="caption" style={styles.statusLine}>
        {simulated
          ? t('compass.simulated')
          : [
              // Manyetometre yoksa alan şiddeti YOKTUR — 0 µT denemez.
              ...(hardware === 'no-magnetometer'
                ? []
                : [
                    t('compass.accuracy', {
                      level: fieldStrength > 0 ? `${fieldStrength} µT` : '—',
                    }),
                  ]),
              source === 'system' ? t('compass.sourceSystem') : t('compass.sourceManual'),
              ...(pose ? [t(pose === 'flat' ? 'compass.poseFlat' : 'compass.poseUpright')] : []),
              reference === 'true' ? t('settings.northTrue') : t('settings.northMagnetic'),
              ...(offsetDeg !== 0
                ? [`${t('settings.offsetTitle')}: ${offsetDeg > 0 ? '+' : ''}${offsetDeg}°`]
                : []),
            ].join(' · ')}
      </ThemedText>
    </ScrollView>
  );
}


const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.systemBackground },
root: {
      flexGrow: 1,
      backgroundColor: colors.systemBackground,
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    sunRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
    sunItem: { flex: 1, alignItems: 'center', minWidth: 0 },
    sunTime: { fontVariant: ['tabular-nums'] },
    sunDivider: { width: 1, height: 28, backgroundColor: colors.separator },
    // Kadranın esnek alanı: kalan yüksekliği alır, kare kenarı buradan ölçülür.
    dialArea: {
      flex: 1,
      minHeight: DIAL_MIN,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Su terazisi katmanı bu kutunun koordinat sisteminde konumlanır; bu yüzden
    // kadranla aynı boyutta olmak ZORUNDA.
    dialBox: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
    // Derece okuması kadranın hemen altında: büyük derece + yanında yön harfi.
readingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: spacing.sm,
      flexShrink: 1,
    },
    addressBlock: { alignItems: 'center', gap: spacing.xs, alignSelf: 'stretch' },
    addressText: { textAlign: 'center' },
    /**
     * `stretch` yükseklikleri eşitler, `flexWrap` tablette alt alta düşmeyi
     * sağlar. `gap` yerine `columnGap`/`rowGap` dar ekranda yatay boşluğu
     * kısar, böylece metin için yer kalır.
     */
    actionRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      columnGap: spacing.sm,
      rowGap: spacing.sm,
      flexWrap: 'wrap',
      alignSelf: 'stretch',
    },
    action: { flex: 1, minWidth: 132 },
    coordText: { fontVariant: ['tabular-nums'], textAlign: 'center' },
    noticeBox: {
      alignSelf: 'stretch',
      alignItems: 'center',
      gap: spacing.xs,
      borderColor: colors.systemOrange,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.sm,
    },
    noticeTitle: { textAlign: 'center', color: colors.systemOrange },
    noticeBody: { textAlign: 'center' },
    noticeOk: { textAlign: 'center', color: colors.systemGreen },
    warnBox: {
      alignItems: 'center',
      gap: spacing.xs,
      borderColor: colors.systemOrange,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.sm,
    },
    warnText: { color: colors.systemOrange, textAlign: 'center' },
    statusLine: { textAlign: 'center' },
  });
