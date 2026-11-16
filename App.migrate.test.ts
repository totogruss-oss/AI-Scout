import { describe, expect, it, vi } from 'vitest';

// App.tsx bindet beim Laden Browser-Funktionen ein; für den Test der reinen
// Bereinigungslogik genügen Platzhalter.
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });

import { migrateExpert } from './App';
import { Expert } from './types';

const stored = (extra: Partial<Expert>): Expert =>
  ({ id: 'x', name: 'Unbekannt', role: 'Rolle', topics: ['t'], active: true, ...extra });

describe('Bereinigung gespeicherter Profile', () => {
  it('entfernt den fälschlich zugeordneten Firmeneintrag samt Text und Logo', () => {
    const result = migrateExpert(stored({
      name: 'Jack Clark', wikidataId: 'Q116758847', wikipediaTitle: 'Anthropic', wikipediaLang: 'en',
      bio: 'Anthropic ist ein Unternehmen …', bioOrigin: 'wikipedia',
      imageUrl: 'https://commons.wikimedia.org/logo.png', imageOrigin: 'wikidata', imageCredit: 'Wikimedia Commons',
      enrichedAt: '2026-11-03T10:00:00Z',
      links: [{ type: 'website', url: 'https://www.anthropic.com', origin: 'wikidata' }],
    }));
    expect(result).toMatchObject({ wikidataId: undefined, wikipediaTitle: undefined, bio: undefined, imageUrl: undefined, enrichedAt: undefined });
    expect(result.links?.some(l => l.url.includes('anthropic.com'))).toBe(false);
    // Kuratierte Links bleiben erhalten.
    expect(result.links?.some(l => l.url.includes('importai'))).toBe(true);
  });

  it('behält ein selbst eingetragenes Bild und eine eigene Biografie', () => {
    const result = migrateExpert(stored({
      name: 'Peter Steinberger', wikidataId: 'Q17065875', wikipediaTitle: 'Peter Steinberger',
      bio: 'Eigener Text', bioOrigin: 'manuell', imageUrl: 'https://example.org/ps.jpg', imageOrigin: 'manuell',
    }));
    expect(result).toMatchObject({ wikidataId: undefined, bio: 'Eigener Text', imageUrl: 'https://example.org/ps.jpg' });
  });

  it('ergänzt die kuratierte Wikidata-Kennung und lässt korrekte Profile unverändert', () => {
    expect(migrateExpert(stored({ name: 'Geoffrey Hinton' })).wikidataId).toBe('Q92894');
    const ok = stored({ name: 'Geoffrey Hinton', wikidataId: 'Q92894', imageUrl: 'https://example.org/h.jpg', imageOrigin: 'wikidata', enrichedAt: '2026-11-03T10:00:00Z' });
    expect(migrateExpert(ok)).toMatchObject({ imageUrl: 'https://example.org/h.jpg', enrichedAt: '2026-11-03T10:00:00Z' });
  });
});
