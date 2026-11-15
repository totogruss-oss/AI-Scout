import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Expert } from '../types';

/** Nachgestellte Gemini-API: Die Tests legen fest, was Suche und Zusammenfassung antworten. */
const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent }; },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
  ThinkingLevel: { HIGH: 'HIGH' },
}));
vi.mock('./apiKeyStore', () => ({ requireApiKey: () => 'test-key' }));

import { generateResearchReport, isQuotaError } from './geminiService';
import { toIsoDate } from './reportPipeline';

const expert = (id: string, name: string, category: Expert['category']): Expert =>
  ({ id, name, role: 'Rolle', topics: [], active: true, category });

const EXPERTS = [
  expert('1', 'Simon Willison', 'Praxis & Engineering'),
  expert('2', 'Gary Marcus', 'Kritik & Ethik'),
];

const daysAgo = (n: number) => {
  const d = new Date();
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n));
};

const finding = (name: string, date: string, url: string) =>
  `=== FUND ===\nEXPERTE: ${name}\nDATUM: ${date}\nBEZUG: eigen\nTYP: News\nQUELLE: Blog\nURL: ${url}\nTITEL: Titel von ${name}\nTAGS: a, b\nZUSAMMENFASSUNG: Belegter Satz von ${name}.\n`;

const searchResponse = (text: string, title?: string) => ({
  text,
  candidates: [{
    groundingMetadata: title ? {
      groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/X', title } }],
      groundingSupports: [{ segment: { text: text.match(/Belegter Satz von [^\n]+/)![0] }, groundingChunkIndices: [0] }],
    } : undefined,
  }],
});

const synthesisResponse = { text: JSON.stringify({ title: 'Überschrift', intro: 'Einordnung.', actionSteps: ['Impuls (Fund 1)'] }) };
const isSearch = (request: any) => Array.isArray(request.config?.tools);
const quotaError = () => Object.assign(new Error('quota'), { status: 429 });

beforeEach(() => {
  generateContent.mockReset();
  // Erreichbarkeitsprüfung: Abrufdienst antwortet nicht -> Status bleibt offen.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('generateResearchReport', () => {
  it('sucht je Gruppe getrennt und fasst erst danach zusammen', async () => {
    generateContent.mockImplementation(async (request: any) => {
      if (!isSearch(request)) return synthesisResponse;
      return request.contents.includes('Simon Willison')
        ? searchResponse(finding('Simon Willison', daysAgo(2), 'https://simonwillison.net/a'), 'simonwillison.net')
        : searchResponse('=== KEINE FUNDE: Gary Marcus ===');
    });

    const report = await generateResearchReport(EXPERTS, () => {});

    const calls = generateContent.mock.calls.map(c => c[0]);
    expect(calls.filter(isSearch)).toHaveLength(2);
    expect(calls.filter(c => !isSearch(c))).toHaveLength(1);
    // Die Zusammenfassung läuft ohne Suche und sieht nur die geprüften Funde.
    expect(calls.find(c => !isSearch(c)).contents).toContain('Belegter Satz von Simon Willison');

    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({ expertName: 'Simon Willison', verification: 'belegt', linkStatus: undefined });
    expect(report.title).toBe('Überschrift');
    expect(report.actionSteps).toEqual(['Impuls (Fund 1)']);
    expect(report.quality).toMatchObject({ searched: 2, belegt: 1, withoutFindings: ['Gary Marcus'], notChecked: [] });
  });

  it('gibt keine Empfehlungen aus, wenn kein Fund durch die Suche gestützt ist', async () => {
    generateContent.mockImplementation(async (request: any) =>
      isSearch(request) ? searchResponse(finding('Simon Willison', daysAgo(1), 'https://erfunden.example/a')) : synthesisResponse);

    const report = await generateResearchReport([EXPERTS[0]], () => {});
    expect(report.items[0].verification).toBe('unbelegt');
    expect(report.actionSteps).toEqual([]);
  });

  it('weist fehlgeschlagene Suchläufe als „nicht geprüft" aus, statt sie zu verschweigen', async () => {
    generateContent.mockImplementation(async (request: any) => {
      if (!isSearch(request)) return synthesisResponse;
      if (request.contents.includes('Gary Marcus')) throw Object.assign(new Error('kaputt'), { status: 400 });
      return searchResponse(finding('Simon Willison', daysAgo(2), 'https://simonwillison.net/a'), 'simonwillison.net');
    });

    const report = await generateResearchReport(EXPERTS, () => {});
    expect(report.items).toHaveLength(1);
    expect(report.quality?.notChecked).toEqual(['Gary Marcus']);
    expect(report.quality?.withoutFindings).toEqual([]);
  });

  it('schreibt ohne Funde einen ehrlichen leeren Bericht und spart die Zusammenfassung', async () => {
    generateContent.mockResolvedValue(searchResponse(finding('Simon Willison', daysAgo(40), 'https://simonwillison.net/alt')));

    const report = await generateResearchReport([EXPERTS[0]], () => {});
    expect(report.items).toEqual([]);
    expect(report.title).toBe('Keine belegten Funde');
    expect(report.quality).toMatchObject({ droppedTooOld: 1, withoutFindings: ['Simon Willison'] });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('behält die geprüften Funde, auch wenn die Zusammenfassung scheitert', async () => {
    generateContent.mockImplementation(async (request: any) => {
      if (!isSearch(request)) throw Object.assign(new Error('kaputt'), { status: 400 });
      return searchResponse(finding('Simon Willison', daysAgo(2), 'https://simonwillison.net/a'), 'simonwillison.net');
    });

    const report = await generateResearchReport([EXPERTS[0]], () => {});
    expect(report.items).toHaveLength(1);
    expect(report.intro).toContain('konnte nicht erstellt werden');
  });

  it('meldet ein erschöpftes Kontingent als Fehler, wenn kein einziger Suchlauf klappt', async () => {
    vi.useFakeTimers();
    generateContent.mockRejectedValue(quotaError());

    const outcome = generateResearchReport(EXPERTS, () => {}).catch(e => e);
    await vi.runAllTimersAsync();
    const error = await outcome;
    vi.useRealTimers();

    expect(isQuotaError(error)).toBe(true);
    // Je Gruppe ein Versuch plus zwei Wiederholungen.
    expect(generateContent).toHaveBeenCalledTimes(6);
  });

  it('versucht nach erschöpftem Kontingent keine weiteren Gruppen mehr', async () => {
    vi.useFakeTimers();
    const many = ['A', 'B', 'C', 'D'].map((name, i) => expert(`m${i}`, `Person ${name}`, (['Praxis & Engineering', 'Kritik & Ethik', 'Grundlagenforschung', 'Bildung & DACH'] as const)[i]));
    generateContent.mockImplementation(async (request: any) => {
      if (!isSearch(request)) return synthesisResponse;
      if (request.contents.includes('Person A')) return searchResponse(finding('Person A', daysAgo(1), 'https://a.example/1'), 'a.example');
      throw quotaError();
    });

    const outcome = generateResearchReport(many, () => {});
    await vi.runAllTimersAsync();
    const report = await outcome;
    vi.useRealTimers();

    expect(report.quality?.notChecked.sort()).toEqual(['Person B', 'Person C', 'Person D']);
    // Zwei Suchläufe laufen gleichzeitig: A klappt (1), B und C scheitern nach je zwei
    // Wiederholungen (3 + 3), D wird danach nicht mehr versucht, dazu die Zusammenfassung (1).
    expect(generateContent).toHaveBeenCalledTimes(8);
  });

  it('bricht ohne aktive Personen sofort ab', async () => {
    await expect(generateResearchReport([{ ...EXPERTS[0], active: false }], () => {})).rejects.toThrow('Keine aktiven Personen');
    expect(generateContent).not.toHaveBeenCalled();
  });
});
