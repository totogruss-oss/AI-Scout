import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { Expert, ExpertLink, ExpertLinkType, ExpertMilestone, Report, ReportItem, LinkStatus, FastScanResult } from '../types';

import { requireApiKey } from './apiKeyStore';
import {
  BatchResult, ExpertBatch, GroundingInfo, EMPTY_REPORT_TEXT, SEARCH_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT,
  buildBatches, buildQuality, buildSearchPrompt, buildSynthesisPrompt, mergeItems, processBatchResponse,
} from './reportPipeline';

// Initialize Gemini mit dem Key der nutzenden Person (Bring Your Own Key)
const getClient = () => new GoogleGenAI({ apiKey: requireApiKey() });

// WAV Header Helper
function createWavHeader(sampleRate: number, numChannels: number, bitsPerSample: number, dataLength: number): Uint8Array {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true); // Subchunk2Size

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Helper to convert Base64 to Int16Array (PCM data)
function base64ToInt16Array(base64: string): Int16Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

// Known domains that often use paywalls or subscription models
const PAYWALL_DOMAINS = [
  'handelsblatt.com',
  'zeit.de',
  'spiegel.de',
  'faz.net',
  'sueddeutsche.de',
  'welt.de',
  'bild.de',
  'nytimes.com',
  'wsj.com',
  'ft.com',
  'economist.com',
  'bloomberg.com',
  'wired.com',
  'hbr.org',
  'medium.com',
  'insider.com',
  'businessinsider.',
  'techcrunch.com', // Sometimes partial
  'plus.', // Subdomains like plus.tagesspiegel.de
  'abo.'
];

const validateLink = async (url: string, sourceName: string): Promise<LinkStatus | undefined> => {
  if (!url || !url.startsWith('http')) return 'warning';

  const lowerUrl = url.toLowerCase();
  
  // Check for Paywall domains
  const isPaywall = PAYWALL_DOMAINS.some(domain => lowerUrl.includes(domain));
  if (isPaywall) return 'paywall';

  // Heuristic: If specific source name indicates paid content
  if (sourceName.toLowerCase().includes('plus') || sourceName.toLowerCase().includes('abo')) {
    return 'paywall';
  }

  // Erreichbarkeit über einen öffentlichen Abrufdienst prüfen. Antwortet der Dienst
  // nicht, bleibt der Status offen – ein blinder Abruf ohne Antwort-Einsicht würde
  // auch bei „Seite nicht gefunden" Erfolg melden.
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    const data = await res.json();
    const code = data?.status?.http_code;
    if (typeof code !== 'number') return undefined;
    // Nur eindeutige Befunde melden: 401/403/429 heißen meist bloß „Abrufdienst geblockt".
    if (code === 404 || code === 410) return 'warning';
    return code < 400 ? 'accessible' : undefined;
  } catch {
    return undefined;
  }
};

export interface ExpertProfileResearch {
  role: string;
  company: string;
  description: string;
  relevance: string;
  bio?: string;
  currentFocus?: string;
  positions?: string;
  milestones: ExpertMilestone[];
  keyWorks: string[];
  primaryChannels: string[];
  suggestedLinks: ExpertLink[];
}

const LINK_TYPES: ExpertLinkType[] = [
  'website', 'x', 'linkedin', 'bluesky', 'mastodon', 'threads', 'github',
  'youtube', 'scholar', 'substack', 'blog', 'podcast', 'wikipedia', 'other',
];

/**
 * KI-Recherche für das Experten-Dossier (Google-Search-Grounding).
 * Bewusst KEINE Bild-URLs: Modelle erfinden diese zuverlässig falsch.
 * Links werden als „ki" (unverifiziert) markiert und in der Oberfläche so angezeigt.
 */
export const analyzeExpertProfile = async (expert: Pick<Expert, 'name' | 'role' | 'company'>): Promise<ExpertProfileResearch> => {
  const ai = getClient();
  const context = [expert.role, expert.company].filter(v => v && v !== 'Unbekannt').join(', ');

  const prompt = `Recherchiere mit der Websuche die Person '${expert.name}'${context ? ` (bekannter Kontext: ${context})` : ''} im Kontext von Künstlicher Intelligenz. Heute ist der ${new Date().toLocaleDateString('de-DE')}. Nutze aktuelle Quellen – Rollen ändern sich schnell.

Liefere ein sachliches Dossier auf Deutsch:
1. role / company: AKTUELLE Rolle und Organisation.
2. description: Wer ist das? (max. 3 Sätze)
3. bio: Ausführliche Biografie (5–8 Sätze): Ausbildung, Werdegang, wichtigste Stationen.
4. relevance: Warum ist die Person aktuell im KI-Sektor wichtig? Warum lohnt es sich, ihr zu folgen? (max. 3 Sätze)
5. currentFocus: Woran arbeitet sie aktuell (letzte 6–12 Monate)? (2–3 Sätze)
6. positions: Welche Haltungen vertritt sie in zentralen KI-Debatten (z. B. Risiken, Open Source, Regulierung, AGI)? (2–4 Sätze)
7. milestones: 4–8 Karrierestationen als { year, text }, chronologisch.
8. keyWorks: 3–6 Schlüsselwerke (Paper, Bücher, Produkte, Projekte).
9. primaryChannels: Über welche Kanäle publiziert die Person tatsächlich regelmäßig (z. B. "X", "Substack", "YouTube", "LinkedIn")?
10. links: Offizielle Profile. Nur URLs, die du in den Suchergebnissen tatsächlich gesehen hast. Erlaubte Typen: ${LINK_TYPES.join(', ')}.

REGELN: Erfinde nichts. Wenn etwas unklar ist, lass das Feld leer. Keine Bild-URLs.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING },
          company: { type: Type.STRING },
          description: { type: Type.STRING },
          bio: { type: Type.STRING },
          relevance: { type: Type.STRING },
          currentFocus: { type: Type.STRING },
          positions: { type: Type.STRING },
          milestones: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { year: { type: Type.STRING }, text: { type: Type.STRING } },
              required: ["year", "text"]
            }
          },
          keyWorks: { type: Type.ARRAY, items: { type: Type.STRING } },
          primaryChannels: { type: Type.ARRAY, items: { type: Type.STRING } },
          links: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: LINK_TYPES },
                url: { type: Type.STRING },
                label: { type: Type.STRING }
              },
              required: ["type", "url"]
            }
          }
        },
        required: ["role", "company", "description", "relevance"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || "{}");
    const suggestedLinks: ExpertLink[] = (Array.isArray(data.links) ? data.links : [])
      .filter((l: any) => l && typeof l.url === 'string' && /^https?:\/\//.test(l.url) && LINK_TYPES.includes(l.type))
      .map((l: any) => ({ type: l.type, url: l.url, label: l.label || undefined, origin: 'ki' as const }));

    return {
      role: data.role || "Unbekannt",
      company: data.company || "Unbekannt",
      description: data.description || "Keine Beschreibung verfügbar.",
      relevance: data.relevance || "Keine Relevanz verfügbar.",
      bio: data.bio || undefined,
      currentFocus: data.currentFocus || undefined,
      positions: data.positions || undefined,
      milestones: Array.isArray(data.milestones) ? data.milestones.filter((m: any) => m?.year && m?.text) : [],
      keyWorks: Array.isArray(data.keyWorks) ? data.keyWorks.filter(Boolean) : [],
      primaryChannels: Array.isArray(data.primaryChannels) ? data.primaryChannels.filter(Boolean) : [],
      suggestedLinks,
    };
  } catch (e) {
    console.error("Failed to parse expert profile:", e);
    throw new Error("Die KI-Antwort zum Profil konnte nicht gelesen werden.");
  }
};

export const generateFastScan = async (onProgress: (msg: string) => void): Promise<FastScanResult> => {
  const ai = getClient();
  onProgress("Starte Fast Scan mit Google Search...");

  const prompt = `Erstelle einen schnellen, prägnanten Überblick über die wichtigsten KI-News und Entwicklungen der letzten 24-48 Stunden. 
Fokussiere dich auf bahnbrechende Modelle, wichtige Unternehmensentscheidungen (OpenAI, Google, Anthropic, Meta, etc.), neue Tools oder relevante Regulierungen.
Formatiere die Antwort in Markdown mit einer kurzen Einleitung und Bulletpoints für die wichtigsten Meldungen.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map(chunk => ({
      title: chunk.web?.title || 'Quelle',
      uri: chunk.web?.uri || '#'
    })).filter(s => s.uri !== '#');

    // Remove duplicates based on URI
    const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());

    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      content: response.text || "Keine Ergebnisse gefunden.",
      sources: uniqueSources
    };
  } catch (error) {
    console.error("Fast Scan failed:", error);
    throw error;
  }
};

/** Modell für Suche und Zusammenfassung des Berichts. */
const REPORT_MODEL = "gemini-3-flash-preview";
/** Gleichzeitige Suchläufe – niedrig halten, sonst greifen die Mengenbegrenzungen der API. */
const SEARCH_CONCURRENCY = 2;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
};

/** Kontingent des API-Keys erschöpft (HTTP 429). */
export const isQuotaError = (error: unknown): boolean => statusOf(error) === 429;

/** Wiederholt bei vorübergehenden Fehlern (Überlastung, Mengenbegrenzung). */
const withRetry = async <T,>(task: () => Promise<T>, delays = [4000, 12000]): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      const status = statusOf(error);
      const retryable = status === 429 || status === 500 || status === 503;
      if (!retryable || attempt >= delays.length) throw error;
      await sleep(delays[attempt]);
    }
  }
};

/** Ein Suchlauf für eine kleine Gruppe von Personen. Antwort als Text, damit die Suchbelege je Textstelle mitkommen. */
const searchBatch = async (ai: GoogleGenAI, batch: ExpertBatch, today: Date): Promise<BatchResult> => {
  const response = await withRetry(() => ai.models.generateContent({
    model: REPORT_MODEL,
    contents: buildSearchPrompt(batch, today),
    config: {
      systemInstruction: SEARCH_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
    },
  }));
  const grounding = response.candidates?.[0]?.groundingMetadata as GroundingInfo | undefined;
  return processBatchResponse(response.text || '', grounding, batch, today);
};

/** Zweiter Schritt: Einordnung nur auf Basis der geprüften Funde – ohne Suche, damit nichts Neues dazukommt. */
const synthesize = async (ai: GoogleGenAI, items: ReportItem[], today: Date): Promise<{ title: string; intro: string; actionSteps: string[] }> => {
  const response = await withRetry(() => ai.models.generateContent({
    model: REPORT_MODEL,
    contents: buildSynthesisPrompt(items, today),
    config: {
      systemInstruction: SYNTHESIS_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          intro: { type: Type.STRING },
          actionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["title", "intro", "actionSteps"],
      },
    },
  }));
  const data = JSON.parse(response.text || "{}");
  return {
    title: typeof data.title === 'string' ? data.title : '',
    intro: typeof data.intro === 'string' ? data.intro : '',
    actionSteps: Array.isArray(data.actionSteps) ? data.actionSteps.filter((s: unknown) => typeof s === 'string' && s.trim()) : [],
  };
};

/**
 * Deep Research in drei Schritten:
 *  1. Suche in kleinen Gruppen (je Kategorie), damit keine Person untergeht.
 *  2. Prüfung jedes Fundes: Datum im Zeitraum? Durch Suchquellen gestützt?
 *  3. Einordnung nur auf Basis der geprüften Funde.
 */
export const generateResearchReport = async (
  experts: Expert[],
  onProgress: (msg: string) => void
): Promise<Report> => {
  const ai = getClient();
  const today = new Date();
  const batches = buildBatches(experts);
  if (batches.length === 0) {
    throw new Error("Keine aktiven Personen ausgewählt.");
  }

  const results: BatchResult[] = [];
  const searched: Expert[] = [];
  const failed: Expert[] = [];
  let lastError: unknown;
  let done = 0;

  onProgress(`Suche läuft: 0 von ${batches.length} Gruppen …`);
  const queue = [...batches];
  const worker = async () => {
    for (let batch = queue.shift(); batch; batch = queue.shift()) {
      try {
        results.push(await searchBatch(ai, batch, today));
        searched.push(...batch.experts);
      } catch (error) {
        console.error(`Suchlauf „${batch.label}" fehlgeschlagen:`, error);
        lastError = error;
        failed.push(...batch.experts);
      }
      done++;
      onProgress(`Suche läuft: ${done} von ${batches.length} Gruppen (${batch.label}) …`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, batches.length) }, worker));

  // Wenn gar kein Suchlauf geklappt hat, ist das ein Fehler und kein leerer Bericht.
  if (searched.length === 0) throw lastError ?? new Error("Die Suche ist fehlgeschlagen.");

  onProgress("Prüfe Quellen und Daten …");
  const merged = mergeItems(results.flatMap(r => r.items));
  const items: ReportItem[] = await Promise.all(merged.map(async item => ({
    ...item,
    linkStatus: await validateLink(item.sourceUrl, item.sourceName),
  })));

  const quality = buildQuality({
    items,
    searchedExperts: searched,
    failedExperts: failed,
    dropped: results.map(r => r.dropped),
  });

  let text = { title: EMPTY_REPORT_TEXT.title, intro: EMPTY_REPORT_TEXT.intro, actionSteps: [] as string[] };
  if (items.length > 0) {
    onProgress("Schreibe Einordnung …");
    try {
      const synthesis = await synthesize(ai, items, today);
      text = {
        title: synthesis.title || "KI-Update",
        intro: synthesis.intro || "Die Einordnung konnte nicht erstellt werden. Die geprüften Funde stehen unten.",
        // Empfehlungen nur, wenn mindestens ein Fund durch die Suche gestützt ist.
        actionSteps: items.some(i => i.verification !== 'unbelegt') ? synthesis.actionSteps : [],
      };
    } catch (error) {
      // Die geprüften Funde sind das Wertvolle – daran soll der Bericht nicht scheitern.
      console.error("Einordnung fehlgeschlagen:", error);
      text = { title: "KI-Update", intro: "Die Einordnung konnte nicht erstellt werden. Die geprüften Funde stehen unten.", actionSteps: [] };
    }
  }

  onProgress("Fertig!");
  return {
    id: crypto.randomUUID(),
    createdAt: today.toISOString(),
    title: text.title,
    intro: text.intro,
    items,
    actionSteps: text.actionSteps,
    rawMarkdown: "N/A",
    quality,
  };
};

/**
 * Fetches the audio data and returns a Blob URL representing a WAV file.
 * This allows using the native <audio> element for full control.
 * NOW READS FULL CONTENT.
 */
export const getReportAudioUrl = async (report: Report, voiceName: string = 'Fenrir'): Promise<string> => {
  const ai = getClient();
  
  // Construct a full script for the TTS
  
  // 1. Intro
  let script = `Hier ist dein vollständiges AI Scout Update: ${report.title}. \n\n`;
  script += `Zuerst die Analyse der Woche: ${report.intro} \n\n`;
  
  // 2. Items Loop
  script += `Kommen wir nun zu den Details. Wir haben ${report.items.length} relevante Updates gefunden. \n\n`;
  
  report.items.forEach((item, index) => {
    script += `Meldung ${index + 1}: ${item.headline}. \n`;
    script += `Experte: ${item.expertName}. \n`;
    script += `${item.summary} \n\n`;
  });

  // 3. Action Steps
  if (report.actionSteps && report.actionSteps.length > 0) {
    script += `Zum Abschluss die strategischen Handlungsempfehlungen für diese Woche: \n`;
    report.actionSteps.forEach((step, index) => {
      script += `${index + 1}: ${step}. \n`;
    });
  }

  script += `\nDas war der Report. Vielen Dank fürs Zuhören.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: {
      parts: [{ text: script }]
    },
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName }
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Kein Audio generiert");

  // Create WAV container
  const pcmData = base64ToInt16Array(base64Audio);
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  
  const header = createWavHeader(sampleRate, numChannels, bitsPerSample, pcmData.byteLength);
  
  // Combine header and data
  const wavBytes = new Uint8Array(header.length + pcmData.byteLength);
  wavBytes.set(header);
  wavBytes.set(new Uint8Array(pcmData.buffer), header.length);

  // Create Blob
  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

export interface AssistantResponse {
  text: string;
  sources: { title: string; uri: string }[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/**
 * Answers questions about the reports using Gemini Pro with Thinking Mode
 */
export const askAssistant = async (query: string, reports: Report[], history: ChatMessage[] = []): Promise<AssistantResponse> => {
  const ai = getClient();
  
  // Create a richer context from reports
  const context = reports.slice(0, 10).map(r => 
    `Report vom ${r.createdAt}: ${r.title}\n` +
    `Intro: ${r.intro}\n` +
    `Themen:\n${r.items.map(i => `- ${i.headline}: ${i.summary}`).join('\n')}\n` +
    `Strategien: ${r.actionSteps.join(', ')}`
  ).join('\n\n---\n\n');

  const systemInstruction = `
    Du bist ein hilfreicher KI-Assistent für einen Schulleiter.
    Du beantwortest Fragen basierend auf dem folgenden Kontext aus archivierten Reports.
    Wenn die Antwort nicht im Kontext steht, weise darauf hin.
    Denke tiefgründig über die Zusammenhänge nach. Antworte prägnant auf Deutsch.
    
    Kontext aus archivierten Reports:
    ${context}
  `;

  const contents = [
    ...history.map(msg => ({ role: msg.role, parts: msg.parts })),
    { role: 'user', parts: [{ text: query }] }
  ];

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: contents as any,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
    }
  });

  return {
    text: response.text || "Ich konnte dazu leider keine Informationen finden.",
    sources: []
  };
};