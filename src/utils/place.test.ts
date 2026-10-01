import {
  buildShareMessage,
  distanceMeters,
  formatAddressLine,
  formatCoordinates,
  geoUri,
  type AddressParts,
} from './place';

const addr = (over: Partial<AddressParts> = {}): AddressParts => ({
  street: null,
  district: null,
  city: null,
  region: null,
  country: null,
  postalCode: null,
  name: null,
  ...over,
});

describe('formatAddressLine', () => {
  it('builds the requested order: street, district, city, region, country', () => {
    const line = formatAddressLine(
      addr({
        street: 'Bağdat Caddesi 123',
        district: 'Caferağa Mahallesi',
        city: 'Kadıköy',
        region: 'İstanbul',
        country: 'Türkiye',
      }),
    );
    expect(line).toBe('Bağdat Caddesi 123, Caferağa Mahallesi, Kadıköy, İstanbul, Türkiye');
  });

  it('skips missing parts without inventing values', () => {
    const line = formatAddressLine(
      addr({ street: 'Atatürk Bulvarı 9', city: 'Ankara', country: 'Türkiye' }),
    );
    expect(line).toBe('Atatürk Bulvarı 9, Ankara, Türkiye');
    expect(line).not.toContain('null');
    expect(line).not.toContain('undefined');
  });

  it('drops a duplicated city/region pair (İstanbul, İstanbul)', () => {
    const line = formatAddressLine(
      addr({ street: 'İstiklal Cd. 1', city: 'İstanbul', region: 'İstanbul', country: 'Türkiye' }),
    );
    expect(line).toBe('İstiklal Cd. 1, İstanbul, Türkiye');
  });

  it('pairs the postal code with a locality part, not glued to the street', () => {
    // Gerçek çıktı: "Ortaköy Caddesi 71L, Selimpaşa 34590, İstanbul, Türkiye"
    const line = formatAddressLine(
      addr({ street: 'Ortaköy Caddesi 71L', district: 'Selimpaşa', city: 'İstanbul', postalCode: '34590' }),
    );
    expect(line).toBe('Ortaköy Caddesi 71L, Selimpaşa 34590, İstanbul');
  });

  it('falls back to the raw name, then to null', () => {
    expect(formatAddressLine(addr({ name: 'Yıldız Parkı' }))).toBe('Yıldız Parkı');
    expect(formatAddressLine(addr())).toBeNull();
    expect(formatAddressLine(null)).toBeNull();
    expect(formatAddressLine(addr({ street: '   ' }))).toBeNull();
  });
});

describe('formatCoordinates', () => {
  it('is fixed to 6 decimals and comma separated', () => {
    expect(formatCoordinates(41.0082, 28.9784)).toBe('41.008200, 28.978400');
    expect(formatCoordinates(-33.8688, 151.2093)).toBe('-33.868800, 151.209300');
  });
});

describe('buildShareMessage', () => {
  it('contains the address, coordinates, accuracy and both map links', () => {
    const msg = buildShareMessage('Caferağa Mah. 34710, Kadıköy, İstanbul', 41.0082, 28.9784, 12);
    expect(msg).toContain('Caferağa Mah. 34710, Kadıköy, İstanbul');
    expect(msg).toContain('41.008200, 28.978400');
    expect(msg).toContain('±12 m');
    expect(msg).toContain('https://maps.google.com/?q=');
    expect(msg).toContain('https://maps.apple.com/?q=41.0082,28.9784');
  });

  it('works without an address (coordinates only)', () => {
    const msg = buildShareMessage(null, 41, 29, null);
    expect(msg.split('\n')[0]).toBe('41.000000, 29.000000');
    expect(msg).not.toContain('Accuracy');
    expect(msg).toContain('maps.apple.com');
  });

  it('url-encodes the query so spaces and commas survive', () => {
    const msg = buildShareMessage('Moda Cd. 1, Kadıköy', 41, 29, null);
    const url = msg.split('\n').find((l) => l.includes('maps.google.com'))!;
    expect(url).toContain('q=41.000000%2C%2029.000000');
    expect(url).not.toMatch(/q=[^%]*\s/);
  });
});

describe('geoUri', () => {
  it('uses the geo: scheme both map apps understand', () => {
    const uri = geoUri(41.0082, 28.9784, 'Kadıköy, İstanbul');
    expect(uri.startsWith('geo:41.0082,28.9784?q=')).toBe(true);
    expect(uri).toContain('Kad%C4%B1k%C3%B6y');
  });

  it('falls back to the coordinates as the label', () => {
    expect(geoUri(41, 29)).toContain('41.000000%2C%2029.000000');
  });
});

describe('distanceMeters', () => {
  it('is zero for the same point and symmetric', () => {
    expect(distanceMeters(41, 29, 41, 29)).toBeCloseTo(0, 3);
    expect(distanceMeters(41, 29, 41.1, 29)).toBeCloseTo(distanceMeters(41.1, 29, 41, 29), 3);
  });

  it('matches a known separation (Istanbul ↔ Ankara ≈ 350 km)', () => {
    const d = distanceMeters(41.0082, 28.9784, 39.9334, 32.8597);
    expect(d).toBeGreaterThan(340_000);
    expect(d).toBeLessThan(360_000);
  });

  it('one degree of latitude is ~111 km', () => {
    expect(distanceMeters(0, 0, 1, 0)).toBeCloseTo(111_000, -3);
  });
});
