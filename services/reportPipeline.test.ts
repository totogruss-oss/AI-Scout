import { describe, expect, it } from 'vitest';
import { Expert } from '../types';
import {
  GroundingInfo, buildBatches, buildQuality, buildSearchPrompt, classify, cleanUrl, matchExpert,
  mergeItems, parseBlocks, parseItemDate, processBatchResponse, sameSite, toIsoDate,
} from './reportPipeline';

const expert = (id: string, name: string, category?: Expert['category'], active = true): Expert =>
  ({ id, name, role: 'Rolle', topics: [], active, category });

const TODAY = new Date(2026, 10, 15); // 15.11.2026

const willison = expert('1', 'Simon Willison', 'Praxis & Engineering');
const mollick = expert('2', 'Ethan Mollick', 'Praxis & Engineering');
const zweig = expert('3', 'Katharina Zweig', 'Bildung & DACH');
const batch = { label: 'Test', experts: [willison, mollick, zweig] };

/** Byte-Position wie in den Grounding-Metadaten (UTF-8), nicht Zeichenposition. */
const byteIndex = (text: string, needle: string) =>
  new TextEncoder().encode(text.slice(0, text.indexOf(needle))).length;

const RESPONSE = `=== FUND ===
EXPERTE: Simon Willison
DATUM: 2026-11-12
BEZUG: eigen
TYP: News
QUELLE: simonwillison.net
URL: https://simonwillison.net/2026/Nov/12/agents/
TITEL: Notizen zu Agenten in der Praxis
TAGS: Agenten, Werkzeuge, Praxis
ZUSAMMENFASSUNG: Willison beschreibt, wie er Agenten für größere Aufgaben einsetzt.
Er hält die Prüfung der Ergebnisse für den eigentlichen Engpass.

=== FUND ===
EXPERTE: Ethan Mollick
DATUM: 2026-11-10
BEZUG: eigen
TYP: News
QUELLE: One Useful Thing
URL: https://www.oneusefulthing.org/p/erfunden
TITEL: Über das Lernen mit KI
TAGS: Bildung, Lernen
ZUSAMMENFASSUNG: Mollick fasst Studien zum Lernen mit KI zusammen.

=== FUND ===
EXPERTE: Katharina Zweig
DATUM: 2026-09-01
BEZUG: auftritt
TYP: Podcast
QUELLE: Beispiel-Podcast
URL: https://podcast.example.org/zweig
TITEL: Gespräch über Algorithmen
TAGS: Ethik
ZUSAMMENFASSUNG: Älteres Gespräch, liegt außerhalb des Zeitraums.

=== FUND ===
EXPERTE: Ethan Mollick
DATUM: unbekannt
BEZUG: bericht
TYP: News
QUELLE: Irgendwo
URL: https://irgendwo.example.com/x
TITEL: Fund ohne Datum
TAGS: Test
ZUSAMMENFASSUNG: Ohne Datum darf das nicht in den Bericht.

=== FUND ===
EXPERTE: Sam Altman
DATUM: 2026-11-14
BEZUG: eigen
TYP: Twitter/X
QUELLE: X
URL: https://x.com/sama/status/1
TITEL: Person steht nicht auf der Liste
TAGS: Test
ZUSAMMENFASSUNG: Darf nicht übernommen werden.

=== KEINE FUNDE: Katharina Zweig ===
`;

const GROUNDING: GroundingInfo = {
  groundingChunks: [
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA', title: 'simonwillison.net' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB', title: 'theverge.com' } },
  ],
  groundingSupports: [
    {
      // Abschnitt mit Umlaut davor: prüft die Umrechnung Byte -> Zeichen
      segment: { startIndex: byteIndex(RESPONSE, 'Er hält die Prüfung'), text: 'Er hält die Prüfung der Ergebnisse für den eigentlichen Engpass.' },
      groundingChunkIndices: [0],
    },
    {
      segment: { startIndex: byteIndex(RESPONSE, 'Mollick fasst Studien'), text: 'Mollick fasst Studien zum Lernen mit KI zusammen.' },
      groundingChunkIndices: [1],
    },
  ],
};

describe('Datum', () => {
  it('liest ISO- und deutsches Format', () => {
    expect(toIsoDate(parseItemDate('2026-11-03')!)).toBe('2026-11-03');
    expect(toIsoDate(parseItemDate('3.11.2026')!)).toBe('2026-11-03');
    expect(toIsoDate(parseItemDate('ca. 2026-11-03 (laut Blog)')!)).toBe('2026-11-03');
  });
  it('lehnt Unklares und unmögliche Daten ab', () => {
    expect(parseItemDate('unbekannt')).toBeNull();
    expect(parseItemDate('November 2026')).toBeNull();
    expect(parseItemDate('2026-02-31')).toBeNull();
    expect(parseItemDate(undefined)).toBeNull();
  });
});

describe('Suchläufe', () => {
  it('gruppiert aktive Personen nach Kategorie und teilt große Gruppen gleichmäßig', () => {
    const many = Array.from({ length: 5 }, (_, i) => expert(`a${i}`, `Person ${i}`, 'Grundlagenforschung'));
    const batches = buildBatches([...many, zweig, expert('x', 'Inaktiv', 'Bildung & DACH', false), expert('y', 'Ohne Kategorie')]);
    expect(batches.map(b => [b.label, b.experts.length])).toEqual([
      ['Grundlagenforschung (1/2)', 3],
      ['Grundlagenforschung (2/2)', 2],
      ['Bildung & DACH', 1],
      ['Weitere', 1],
    ]);
  });
  it('nennt im Prompt den genauen Zeitraum und alle Personen', () => {
    const prompt = buildSearchPrompt(batch, TODAY);
    expect(prompt).toContain('zwischen dem 2026-11-01 und dem 2026-11-15');
    for (const e of batch.experts) expect(prompt).toContain(e.name);
  });
});

describe('Antwort lesen', () => {
  it('zerlegt in Blöcke und hängt Fortsetzungszeilen an', () => {
    const blocks = parseBlocks(RESPONSE);
    expect(blocks).toHaveLength(5);
    expect(blocks[0].fields.zusammenfassung).toContain('Engpass');
  });
  it('kommt mit Fettdruck und fehlender Trennzeile zurecht', () => {
    const sloppy = `Hier die Funde:\n\n**EXPERTE:** Simon Willison\n**DATUM:** 2026-11-12\n**TITEL:** Eins\n**ZUSAMMENFASSUNG:** Text.\n\n**EXPERTE:** Ethan Mollick\n**DATUM:** 2026-11-11\n**TITEL:** Zwei\n**ZUSAMMENFASSUNG:** Text.`;
    const blocks = parseBlocks(sloppy);
    expect(blocks.map(b => b.fields.titel)).toEqual(['Eins', 'Zwei']);
    expect(blocks[0].fields.experte).toBe('Simon Willison');
  });
  it('holt Adressen aus Markdown und Klammern', () => {
    expect(cleanUrl('[Blog](https://example.org/a-b?x=1).')).toBe('https://example.org/a-b?x=1');
    expect(cleanUrl('<https://example.org/pfad>')).toBe('https://example.org/pfad');
    expect(cleanUrl('keine Adresse')).toBe('');
  });
  it('ordnet Namen nur zu, wenn es eindeutig ist', () => {
    expect(matchExpert('**Simon Willison**', batch.experts)).toBe(willison);
    expect(matchExpert('Prof. Dr. Katharina Zweig', batch.experts)).toBe(zweig);
    expect(matchExpert('Mollick', batch.experts)).toBe(mollick);
    expect(matchExpert('Sam Altman', batch.experts)).toBeUndefined();
  });
});

describe('Belege', () => {
  it('erkennt gleiche Websites auch mit Subdomain', () => {
    expect(sameSite('blog.example.com', 'example.com')).toBe(true);
    expect(sameSite('example.com', 'beispiel.com')).toBe(false);
    expect(sameSite('', 'example.com')).toBe(false);
  });
  it('stuft ohne jede Suchquelle als unbelegt ein', () => {
    expect(classify('https://example.org/x', [], undefined)).toBe('unbelegt');
    expect(classify('', [], GROUNDING)).toBe('unbelegt');
  });
  it('stuft als teilweise ein, wenn nur die Website in der Suche vorkam', () => {
    expect(classify('https://simonwillison.net/anderes', [], GROUNDING)).toBe('teilweise');
  });
});

describe('Ein kompletter Suchlauf', () => {
  const result = processBatchResponse(RESPONSE, GROUNDING, batch, TODAY);

  it('übernimmt nur datierte Funde im Zeitraum zu Personen der Liste', () => {
    expect(result.items.map(i => i.expertName)).toEqual(['Simon Willison', 'Ethan Mollick']);
    expect(result.dropped).toEqual({ 'zu-alt': 1, 'ohne-datum': 1, 'nicht-zuordenbar': 1, 'unvollstaendig': 0 });
  });
  it('belegt: Suchquelle stützt den Eintrag und stammt von derselben Website', () => {
    const item = result.items[0];
    expect(item.verification).toBe('belegt');
    expect(item.groundedSources).toEqual([{ title: 'simonwillison.net', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA' }]);
    expect(item.attribution).toBe('eigen');
    expect(item.date).toBe('2026-11-12');
    expect(item.tags).toEqual(['Agenten', 'Werkzeuge', 'Praxis']);
  });
  it('teilweise: Suchquelle stützt den Eintrag, aber der Link zeigt auf eine andere Website', () => {
    expect(result.items[1].verification).toBe('teilweise');
    expect(result.items[1].groundedSources?.[0].title).toBe('theverge.com');
  });
  it('unbelegt: ohne Grounding-Metadaten wird nichts als belegt ausgegeben', () => {
    const blind = processBatchResponse(RESPONSE, undefined, batch, TODAY);
    expect(blind.items.every(i => i.verification === 'unbelegt')).toBe(true);
  });
  it('lässt Funde am Rand des Zeitraums zu und Zukunftsdaten nicht', () => {
    const block = (date: string) => `=== FUND ===\nEXPERTE: Simon Willison\nDATUM: ${date}\nTITEL: T\nZUSAMMENFASSUNG: Z\n`;
    expect(processBatchResponse(block('2026-11-01'), undefined, batch, TODAY).items).toHaveLength(1);
    expect(processBatchResponse(block('2026-10-31'), undefined, batch, TODAY).dropped['zu-alt']).toBe(1);
    expect(processBatchResponse(block('2026-12-24'), undefined, batch, TODAY).dropped['ohne-datum']).toBe(1);
  });
  it('liefert bei leerer Antwort einen leeren Lauf statt eines Fehlers', () => {
    expect(processBatchResponse('', undefined, batch, TODAY).items).toEqual([]);
    expect(processBatchResponse('=== KEINE FUNDE: Simon Willison ===', undefined, batch, TODAY).items).toEqual([]);
  });
});

describe('Zusammenführen', () => {
  const result = processBatchResponse(RESPONSE, GROUNDING, batch, TODAY);

  it('entfernt Dubletten und behält den besser belegten Eintrag', () => {
    const duplicate = { ...result.items[0], sourceUrl: 'https://www.simonwillison.net/2026/Nov/12/agents/?utm_source=x#top', verification: 'unbelegt' as const };
    const merged = mergeItems([duplicate, ...result.items]);
    expect(merged).toHaveLength(2);
    expect(merged.find(i => i.expertName === 'Simon Willison')?.verification).toBe('belegt');
  });
  it('sortiert Unbelegtes ans Ende, sonst Neuestes zuerst', () => {
    const unproven = { ...result.items[0], headline: 'Neu, aber unbelegt', sourceUrl: 'https://a.example/1', date: '2026-11-15', verification: 'unbelegt' as const };
    expect(mergeItems([unproven, ...result.items]).map(i => i.date)).toEqual(['2026-11-12', '2026-11-10', '2026-11-15']);
  });
  it('weist aus, zu wem nichts gefunden und wer gar nicht geprüft wurde', () => {
    const quality = buildQuality({ items: result.items, searchedExperts: batch.experts, failedExperts: [expert('9', 'Yann LeCun')], dropped: [result.dropped] });
    expect(quality).toMatchObject({
      searched: 3, withoutFindings: ['Katharina Zweig'], notChecked: ['Yann LeCun'],
      belegt: 1, teilweise: 1, unbelegt: 0, droppedTooOld: 1, droppedNoDate: 1, droppedOther: 1,
    });
  });
});
