import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { getFieldModel } from '../../modules/compass-sensors/src';
import {
  distanceMeters,
  formatAddressLine,
  formatCoordinates,
  type AddressParts,
} from '../utils/place';
import { localSunTimes } from '../utils/solar';

export type LocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

export interface LocationInfo {
  status: LocationStatus;
  latitude: number | null;
  longitude: number | null;
  /** Yatay doğruluk (metre). */
  accuracyMeters: number | null;
  address: AddressParts | null;
  /** WMM sapması (doğu-pozitif derece); konum yoksa null. */
  declinationDeg: number | null;
  /** Sapma canlı hesaplandı mı, yoksa son bilinen değer mi? */
  declinationFromCache: boolean;
  /** Yerel saate göre gün doğumu/batımı (konum yoksa null). */
  sunrise: string | null;
  sunset: string | null;
  /** "Sokak/Cadde No, Mahalle, İlçe, İl, Ülke" */
  addressLine: string | null;
  /** "41.008200, 28.978400" */
  coordinateLine: string | null;
  /** Gerçek bir konum var mı. */
  hasFix: boolean;
  /** Yeniden dener (izin verilmiş ama fix gelmemişken kullanıcı basar). */
  refresh: () => void;
}

const CACHE_KEY = 'compass.lastFix.v1';
/** Önbellekteki sapmanın yeniden hesaplanma eşikleri. */
const RECOMPUTE_DISTANCE_M = 50_000;
const RECOMPUTE_AGE_MS = 30 * 24 * 3600 * 1000;
/** Canlı fix bekleme bütçesi: iç mekân 4-8 sn, soğuk GPS 20-30 sn sürebilir. */
const FIX_BUDGET_MS = 25_000;

interface Fix {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  declinationDeg: number | null;
  fromCache: boolean;
  at: number;
  address: AddressParts | null;
}

function toAddress(g: Location.LocationGeocodedAddress | undefined): AddressParts | null {
  if (!g) return null;
  const street = [g.street, g.streetNumber].filter(Boolean).join(' ').trim();
  return {
    street: street.length > 0 ? street : (g.name ?? null),
    district: g.district ?? g.subregion ?? null,
    city: g.city ?? null,
    region: g.region ?? null,
    country: g.country ?? null,
    postalCode: g.postalCode ?? null,
    name: g.name ?? null,
  };
}

/**
 * Konum hook'u — sabit sinyallerin (sapma, gün doğumu/batımı, adres, koordinat)
 * TEK sahibi. Tek GPS isteği yapılır; pusula hook'u yalnızca `declinationDeg`
 * değerini alır, böylece Manyetik ve Gerçek aynı konumu kullanır.
 */
export function useLocationInfo(): LocationInfo {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [fix, setFix] = useState<Fix | null>(null);
  // Render sırasında Date.now() çağırmak saf olmayan render'dır (lint hatası);
  // gün doğumu/batımı ölçüm anında hesaplanıp saklanır.
  const [sun, setSun] = useState<{ sunrise: string; sunset: string; dayLengthHours: number } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  const busy = useRef(false);
  const fixRef = useRef<Fix | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(() => setAttempt((a) => a + 1), []);

  const publish = useCallback((next: Fix | null) => {
    fixRef.current = next;
    if (!alive.current) return;
    setFix(next);
    setSun(
      next === null
        ? null
        : localSunTimes(Date.now(), next.latitude, next.longitude),
    );
  }, []);

  useEffect(() => {
    if (busy.current) return;
    busy.current = true;

    const geocode = async (lat: number, lon: number): Promise<AddressParts | null> => {
      try {
        const list = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        return toAddress(list?.[0]);
      } catch (e) {
        console.warn('[compass] reverse geocode failed', e);
        return null;
      }
    };

    /**
     * Konumu işler: sapmayı gerekirse hesaplar, adresi gerekiyorsa çözer,
     * önbelleğe yazar. `fromCache` live fix beklemeden anında dolu ekran verir.
     */
    const accept = async (
      lat: number,
      lon: number,
      opts: { accuracy: number | null; altitude: number | null; fromCache: boolean },
    ) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const prev = fixRef.current;
      const movedFar =
        prev === null ||
        distanceMeters(prev.latitude, prev.longitude, lat, lon) > RECOMPUTE_DISTANCE_M;
      const stale = prev === null || Date.now() - prev.at > RECOMPUTE_AGE_MS;

      // Sapma: yalnızca ilk fix'te, 50 km'de bir veya 30 günde bir hesaplanır.
      const declinationDeg =
        prev !== null && !movedFar && !stale
          ? prev.declinationDeg
          : (getFieldModel(lat, lon, opts.altitude ?? 0)?.declinationDeg ?? null);

      let address = prev?.address ?? null;
      const needAddress = !opts.fromCache && (address === null || movedFar);
      if (needAddress) {
        address = await geocode(lat, lon);
      }
      if (!alive.current) return;
      publish({
        latitude: lat,
        longitude: lon,
        accuracyMeters: opts.accuracy,
        declinationDeg,
        // Yalnizca BU kaynagin türü: canlı fix gelince bayrak düşer. (Önceden
        // önbellekle OR'lanıyordu ve 'son bilinen' etiketi kalıcı takılı kalıyordu.)
        fromCache: opts.fromCache,
        at: Date.now(),
        address,
      });
    };

    /** Bütçe içinde ilk fix'i bekler; yoksa null (sonsuza dek asılı kalmaz). */
    const waitForFix = async (): Promise<Location.LocationObject | null> => {
      const request = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);
      const budget = new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_BUDGET_MS));
      return Promise.race([request, budget]);
    };

    void (async () => {
      try {
        // 1) Son bilinen konum: soğuk açılışta ekranı anında doldurur.
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last && alive.current) {
          await accept(last.coords.latitude, last.coords.longitude, {
            accuracy: last.coords.accuracy ?? null,
            altitude: last.coords.altitude ?? null,
            fromCache: true,
          });
        }

        // 2) Kalıcı önbellek: uygulama yeniden açıldığında sapma/adres hazır.
        const stored = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
        if (stored && alive.current) {
          try {
            const p = JSON.parse(stored) as Fix;
            if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
              publish({ ...p, fromCache: true });
            }
          } catch {
            // Bozuk önbellek: yok sayılır.
          }
        }

        if (!alive.current) return;
        setStatus((s) => (s === 'ready' ? s : 'locating'));

        // 3) İzin + canlı fix.
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!alive.current) return;
        if (!perm.granted) {
          setStatus('denied');
          return;
        }
        const position = await waitForFix();
        if (!alive.current) return;
        if (!position) {
          // Önbellekteki sapma varsa Gerçek kuzey yine de çalışır durumdadır.
          setStatus(fixRef.current !== null ? 'ready' : 'unavailable');
          return;
        }
        const { latitude, longitude, accuracy, altitude } = position.coords;
        await accept(latitude, longitude, {
          accuracy: accuracy ?? null,
          altitude: altitude ?? null,
          fromCache: false,
        });
        if (!alive.current) return;
        setStatus('ready');
        void AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify(fixRef.current),
        ).catch(() => undefined);
      } catch (e) {
        console.warn('[compass] location flow failed', e);
        if (alive.current) setStatus(fixRef.current !== null ? 'ready' : 'unavailable');
      } finally {
        busy.current = false;
      }
    })();
  }, [attempt, publish]);

  return {
    status,
    latitude: fix?.latitude ?? null,
    longitude: fix?.longitude ?? null,
    accuracyMeters: fix?.accuracyMeters ?? null,
    address: fix?.address ?? null,
    declinationDeg: fix?.declinationDeg ?? null,
    declinationFromCache: fix?.fromCache ?? false,
    sunrise: sun?.sunrise ?? null,
    sunset: sun?.sunset ?? null,
    addressLine: formatAddressLine(fix?.address ?? null),
    coordinateLine:
      fix !== null ? formatCoordinates(fix.latitude, fix.longitude) : null,
    hasFix: fix !== null,
    refresh,
  };
}
