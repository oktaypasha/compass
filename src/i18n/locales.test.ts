import en from './locales/en.json';
import { resources, FALLBACK_LOCALE, LANGUAGES, matchDeviceLocale } from './index';

type Tree = { [k: string]: string | Tree };

function flatten(obj: Tree, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translation resources', () => {
  const langs: string[] = LANGUAGES.map((l) => l.code);
  const reference = flatten(en as Tree).sort();

  it('registers every declared language', () => {
    for (const l of langs) {
      expect(resources).toHaveProperty(l);
    }
    expect(new Set(langs).size).toBe(langs.length);
  });

  it('supports at least a dozen languages, English and Turkish included', () => {
    expect(langs.length).toBeGreaterThanOrEqual(12);
    expect(langs).toContain('en');
    expect(langs).toContain('tr');
  });

  it.each(langs)('%s has exactly the same keys as English', (code) => {
    const t = (resources as Record<string, { translation: Tree }>)[code]?.translation as Tree;
    expect(flatten(t).sort()).toEqual(reference);
  });

  it('declares each language in its own script with a flag', () => {
    for (const l of LANGUAGES) {
      expect(l.label.trim().length).toBeGreaterThan(1);
      // Bayrak: iki bölgesel gösterge (emoji surrogate pair).
      expect([...l.flag].length).toBeGreaterThanOrEqual(2);
      expect(typeof l.rtl).toBe('boolean');
    }
    // Arapça ve Urdu sağdan sola; İngilizce değil.
    expect(LANGUAGES.find((l) => l.code === 'ar')?.rtl).toBe(true);
    expect(LANGUAGES.find((l) => l.code === 'en')?.rtl).toBe(false);
  });

  it('keeps the brand identical in every language', () => {
    for (const code of langs) {
      const t = (resources as Record<string, { translation: Tree }>)[code]?.translation as Tree;
      expect((t.app as Tree).title).toBe('Mergen Compass');
    }
  });

  it('never presents a simulated reading as a real measurement', () => {
    /**
     * Regresyon testi — canlı bir karar.
     *
     * Önceden `compass.simulated` metni "Simulation mode (no sensor)" idi ve
     * uygulama bu satırı GÖSTERMEYE DEVAM EDERKEN sahte kerteriz basıyordu.
     * Kullanıcı bunu uygulamanın bozuk olduğu sanıp siliyordu. Artık:
     *   - sahte ölçüm metni "DEMO" kelimesini içerir, ve
     *   - "no sensor" / "sensör yok" gibi yanıltıcı ifadeler YOKTUR
     *     (cihazda ivmeölçer olabilir; mesaj donanımı tarif etmeli).
     */
    for (const code of langs) {
      const t = (resources as Record<string, { translation: Tree }>)[code]?.translation as Tree;
      const sim = String((t.compass as Tree).simulated).toUpperCase();
      expect({ code, hasDemoTag: sim.includes('DEMO') }).toEqual({ code, hasDemoTag: true });
      // Yanlış donanım iddiası: "sensör yok" yerine manyetometre konusunda konuş.
      expect(/NO SENSOR|SENSÖR YOK|SIN SENSOR|SANS CAPTEUR/i.test(sim)).toBe(false);
      // Donanım eksikliği açıkça ve çözüm önererek anlatılmalı.
      const title = String((t.compass as Tree).noMagnetometerTitle);
      const body = String((t.compass as Tree).noMagnetometerBody);
      expect({ code, len: title.length }).toEqual({ code, len: expect.any(Number) });
      expect(title.trim().length).toBeGreaterThan(3);
      expect(body.trim().length).toBeGreaterThan(15);
    }
  });

  it('has no empty translations', () => {
    for (const code of langs) {
      const t = (resources as Record<string, { translation: Tree }>)[code]?.translation as Tree;
      for (const key of flatten(t)) {
        const value = key
          .split('.')
          .reduce<unknown>((acc, p) => (acc as Tree)[p], t);
        expect(String(value).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps interpolations consistent with English', () => {
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const key of reference) {
      const read = (root: Tree) =>
        key.split('.').reduce<unknown>((acc, p) => (acc as Tree)[p], root);
      const a = String(read(resources.en.translation));
      for (const code of langs) {
        const t = (resources as Record<string, { translation: Tree }>)[code]?.translation as Tree;
        expect({ code, key, vars: vars(String(read(t))) }).toEqual({
          code,
          key,
          vars: vars(a),
        });
      }
    }
  });

  it('has no duplicate top-level section (JSON silently keeps the last one)', () => {
    // Canlıda görüldü: iki "settings" bloğu vardı, ilk ezildi ve ekranda
    // ham anahtarlar çıktı.
    for (const code of langs) {
      const t = (resources as Record<string, { translation: Tree }>)[code]?.translation as Tree;
      const raw = JSON.stringify(t);
      for (const k of Object.keys(t)) {
        const occurrences = (raw.match(new RegExp(`"${k}":\\{`, 'g')) ?? []).length;
        expect({ code, k, occurrences }).toEqual({ code, k, occurrences: 1 });
      }
    }
  });

  it('falls back to a supported locale for an unknown device language', () => {
    const detected = matchDeviceLocale();
    expect(langs).toContain(detected);
    expect(detected).toBe(FALLBACK_LOCALE as AppLocaleOrString);
  });
});

type AppLocaleOrString = string;
