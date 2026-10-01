/**
 * Yer bilgisi saf yardımcıları — ters kodlama çıktısını okunur adres satırına
 * çevirir, koordinat ve paylaşım metni üretir. Hook'lardan ayrı tutulur ki
 * native modül (AsyncStorage/expo-location) yüklenmeden test edilebilsin.
 */

/** Açık adres parçaları — istenen sıra: cadde+sokak, mahalle, ilçe, il, ülke. */
export interface AddressParts {
  /** "Bağdat Caddesi 123" */
  street: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  /** Servis verdiyse ham adres satırı. */
  name: string | null;
}

/** Yarıçap metre cinsinden (WGS-84; bu mesafelerde yeterli). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Açık adres satırı: cadde+sokak, mahalle, ilçe, il, ülke.
 *
 * Posta kodu SOKAĞA YAPIŞTIRILMAZ ("Ortaköy Cd. 71L 34590" okunmaz); ilçe ile
 * birlikte verilir: "Ortaköy Cd. 71L, Selimpaşa 34590, İstanbul, Türkiye".
 * `expo-location` alanları cihazdan cihaza değişir; eksik parça sessizce
 * atlanır, uydurma adres YAZILMAZ. Aynı il/ilçe tekrarı elenir.
 */
export function formatAddressLine(a: AddressParts | null): string | null {
  if (!a) return null;
  const clean = (v: string | null | undefined): string => (v ?? '').trim();
  const street = clean(a.street);
  const postal = clean(a.postalCode);
  // Posta kodu en az kapsayıcı parçanın (mahalle/ilçe/il) yanına eklenir.
  const locality = [a.district, a.city, a.region, a.country]
    .map(clean)
    .filter((p) => p.length > 0);
  const postalHost = locality.find((p) => p.length > 0);
  if (postal && postalHost) locality[locality.indexOf(postalHost)] = `${postalHost} ${postal}`;

  const parts = [street, ...locality].filter((p) => p.length > 0);
  const seen = new Set<string>();
  const uniq = parts.filter((p) => {
    const key = p.toLocaleLowerCase('tr');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (uniq.length > 0) return uniq.join(', ');
  return a.name && a.name.trim().length > 0 ? a.name.trim() : null;
}

/** Altı ondalık, virgülle ayrılmış — harita uygulamalarının beklediği biçim. */
export function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/** `geo:` şeması — Android'de harita uygulamasını doğrudan açar. */
export function geoUri(lat: number, lon: number, label?: string | null): string {
  const q = encodeURIComponent(label ?? formatCoordinates(lat, lon));
  return `geo:${lat},${lon}?q=${lat},${lon}(${q})`;
}

/** Google ve Apple haritalarının ikisinde de doğrudan açılan paylaşım metni. */
export function buildShareMessage(
  addressLine: string | null,
  lat: number,
  lon: number,
  accuracyMeters: number | null,
): string {
  const coords = formatCoordinates(lat, lon);
  const label = addressLine ?? coords;
  const q = encodeURIComponent(`${coords} ${label}`);
  const lines = [
    label,
    coords,
    accuracyMeters !== null ? `Accuracy: ±${Math.round(accuracyMeters)} m` : null,
    `Google Maps: https://maps.google.com/?q=${q}`,
    `Apple Maps:  https://maps.apple.com/?q=${lat},${lon}`,
  ];
  return lines.filter((l): l is string => !!l).join('\n');
}
