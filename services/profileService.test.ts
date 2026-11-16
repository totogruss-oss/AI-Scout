import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Expert } from '../types';
import { LookupUnavailableError, fetchOpenDataProfile, needsEnrichment } from './profileService';

const expert = (extra: Partial<Expert> = {}): Expert =>
  ({ id: '1', name: 'Ada Beispiel', role: 'Forscherin', topics: [], active: true, ...extra });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const human = (id: string, extra: Record<string, unknown> = {}) => ({
  entities: { [id]: { id, claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }], P18: [{ mainsnak: { datavalue: { value: 'Ada Beispiel.jpg' } } }] }, sitelinks: {}, ...extra } },
});
const company = (id: string) => ({
  entities: { [id]: { id, claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q4830453' } } } }], P18: [{ mainsnak: { datavalue: { value: 'Firmenlogo.png' } } }] }, sitelinks: {} } },
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.useRealTimers());

/** Führt die Abfrage aus und lässt Wartezeiten zwischen Wiederholungen sofort verstreichen. */
const run = async (e: Expert) => {
  const outcome = fetchOpenDataProfile(e).then(value => ({ value }), error => ({ error }));
  await vi.runAllTimersAsync();
  return outcome as Promise<{ value?: Awaited<ReturnType<typeof fetchOpenDataProfile>>; error?: unknown }>;
};

describe('Abgleich mit Wikidata/Wikipedia', () => {
  it('holt das Bild über die gespeicherte Wikidata-Kennung', async () => {
    fetchMock.mockResolvedValue(json(human('Q1')));
    const { value } = await run(expert({ wikidataId: 'Q1' }));
    expect(value).toMatchObject({ found: true, wikidataId: 'Q1', imageOrigin: 'wikidata' });
    expect(value?.imageUrl).toContain('Special:FilePath/Ada_Beispiel.jpg');
  });

  it('wiederholt eine gedrosselte Abfrage und liefert dann das Ergebnis', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 429)).mockResolvedValue(json(human('Q1')));
    const { value } = await run(expert({ wikidataId: 'Q1' }));
    expect(value?.found).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('meldet anhaltende Drosselung als Fehler statt als „nicht gefunden"', async () => {
    fetchMock.mockImplementation(async () => json({}, 429));
    const { error } = await run(expert({ wikidataId: 'Q1' }));
    expect(error).toBeInstanceOf(LookupUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('meldet Netzprobleme ebenfalls als Fehler', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { error } = await run(expert({ wikidataId: 'Q1' }));
    expect(error).toBeInstanceOf(LookupUnavailableError);
  });

  it('wertet einen fehlenden Eintrag (404) weiterhin als „nicht gefunden"', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('wbsearchentities') ? json({ search: [] }) : json({}, 404));
    const { value, error } = await run(expert({ wikipediaTitle: 'Gibt_es_nicht', wikipediaLang: 'en' }));
    expect(error).toBeUndefined();
    expect(value).toEqual({ found: false, links: [] });
  });

  it('übernimmt nichts, wenn der Wikipedia-Titel auf einen Artikel über eine Firma umleitet', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/page/summary/')) return json({ title: 'Beispielfirma', extract: 'Eine Firma.', wikibase_item: 'Q99', thumbnail: { source: 'https://example.org/logo.png' } });
      if (url.includes('Q99')) return json(company('Q99'));
      return json({ search: [] });
    });
    const { value } = await run(expert({ wikipediaTitle: 'Ada_Beispiel_(Forscherin)', wikipediaLang: 'en' }));
    expect(value).toEqual({ found: false, links: [] });
  });
});

describe('needsEnrichment', () => {
  const now = new Date('2026-11-16T12:00:00Z').getTime();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

  it('gleicht noch nie abgeglichene Profile ab', () => {
    expect(needsEnrichment(expert(), now)).toBe(true);
  });
  it('lässt Profile mit Bild in Ruhe', () => {
    expect(needsEnrichment(expert({ enrichedAt: daysAgo(30), imageUrl: 'https://example.org/a.jpg' }), now)).toBe(false);
  });
  it('versucht es bei fehlendem Bild nach einer Woche erneut, aber nicht früher', () => {
    expect(needsEnrichment(expert({ enrichedAt: daysAgo(8) }), now)).toBe(true);
    expect(needsEnrichment(expert({ enrichedAt: daysAgo(2) }), now)).toBe(false);
  });
});
