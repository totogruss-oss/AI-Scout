import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { Expert, Report, ReportItem, LinkStatus, FastScanResult } from '../types';

// Initialize Gemini
const getClient = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

const validateLink = async (url: string, sourceName: string): Promise<LinkStatus> => {
  if (!url || !url.startsWith('http')) return 'warning';

  const lowerUrl = url.toLowerCase();
  
  // Check for Paywall domains
  const isPaywall = PAYWALL_DOMAINS.some(domain => lowerUrl.includes(domain));
  if (isPaywall) return 'paywall';

  // Heuristic: If specific source name indicates paid content
  if (sourceName.toLowerCase().includes('plus') || sourceName.toLowerCase().includes('abo')) {
    return 'paywall';
  }

  // Reachability check
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('Proxy failed');
    const data = await res.json();
    if (data.status && data.status.http_code >= 400) {
      return 'warning';
    }
    return 'accessible';
  } catch (error) {
    try {
        await fetch(url, { mode: 'no-cors' });
        return 'accessible';
    } catch (e) {
        return 'warning';
    }
  }
};

export interface ExpertAssessment {
  name: string;
  role: string;
  company: string;
  description: string;
  relevance: string;
  topics: string[];
}

/**
 * KI-Einschätzung für mehrere Experten in EINER Anfrage (statt einer pro Person).
 * Fotos und Biografie kommen aus Wikipedia (wikiService), Gemini liefert nur Rolle, Relevanz und Themen.
 */
export const analyzeExpertsBatch = async (experts: Expert[]): Promise<ExpertAssessment[]> => {
  const ai = getClient();
  const list = experts
    .map(e => `- ${e.name}${e.company && e.company !== 'Unbekannt' ? ` (${e.company})` : ''}`)
    .join('\n');

  const prompt = `Recherchiere den AKTUELLEN Stand (heute: ${new Date().toLocaleDateString('de-DE')}) zu folgenden Personen im Kontext Künstlicher Intelligenz:
${list}

Für JEDE Person:
- role: aktuelle Rolle/Position (kurz)
- company: aktuelles Unternehmen/Institution
- description: Wer ist das? Hintergrund in max. 2 Sätzen
- relevance: Warum ist die Person aktuell wichtig im KI-Sektor und was bedeutet ihre Arbeit für Schule und Bildung? Max. 3 Sätze
- topics: 3-5 aktuelle Schwerpunktthemen

Übernimm den Namen exakt wie in der Liste. Antworte auf Deutsch im JSON-Format.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING },
            company: { type: Type.STRING },
            description: { type: Type.STRING },
            relevance: { type: Type.STRING },
            topics: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["name", "role", "company", "description", "relevance", "topics"]
        }
      }
    }
  });

  // Mit Google-Suche verpackt das Modell JSON gelegentlich in ```json-Blöcke
  const raw = (response.text || "[]").trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Unerwartetes Antwortformat von Gemini");
  return data;
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

export const generateResearchReport = async (
  experts: Expert[],
  onProgress: (msg: string) => void
): Promise<Report> => {
  const ai = getClient();
  const activeExperts = experts.filter(e => e.active);
  const expertNames = activeExperts.map(e => `${e.name} (${e.role})`).join(", ");
  
  onProgress("Analysiere Bildungskontext & starte Deep Search...");

  // Using Flash model for fast search grounding
  const modelId = "gemini-3-flash-preview";

  const systemPrompt = `
    Du bist ein hochspezialisierter KI-Analyst und Strategieberater für Bildungsmanagement.
    
    DEINE MISSION:
    Erstelle einen UMFASSENDEN und DETAILLIERTEN Wochenreport über die Aktivitäten führender KI-Experten.
    
    1. **EXECUTIVE SUMMARY (Priorität A)**:
       - Schreibe eine ausführliche Einleitung (ca. 300-400 Wörter).
       - Fasse nicht nur zusammen, sondern ANALYSIERE: Welche Meta-Trends zeichnen sich diese Woche ab? 
       - Gibt es Widersprüche zwischen den Experten (z.B. LeCun vs. Hinton)?
       - Was bedeutet das "Big Picture" für Schulen und Bildungseinrichtungen?
       - Der Text muss tiefgehend und analytisch sein, kein oberflächliches "Hallo".

    2. **RECHERCHE (Priorität B)**:
       - Sei **ERSCHÖPFEND (Exhaustive)**. Der Nutzer möchte ALLE relevanten neuen Beiträge sehen.
       - Ziel: **15 bis 20 gefundene Items**.
       - Wenn ein Experte aktiv war, MUSS es in den Report. Filtere NICHT aus Platzgründen.
       - **PRIORISIERE DIVERSITÄT DER QUELLEN**: Beschränke dich nicht auf Mainstream-Medien. Suche aktiv nach einer breiten Vielfalt an Quellen, einschließlich Nischenpublikationen, Fachblogs und akademischen Pre-Prints (z.B. arXiv, bioRxiv, OSF Preprints, SSRN). Neben Social Media (X/LinkedIn), Videos (YouTube) und Podcasts sollen auch diese tiefergehenden wissenschaftlichen und fachspezifischen Quellen stark gewichtet werden.

    3. **QUALITÄTSSICHERUNG**:
       - OBERSTE REGEL: Erfinde NIEMALS URLs. Nutze nur Links, die das Tool liefert.
       - Prüfe Paywalls (Markiere Bezahlartikel als solche im Quellennamen, wenn möglich).
  `;

  const userPrompt = `
    Liste der zu überwachenden Experten: ${expertNames}
    
    Führe einen Deep Research durch (Zeitraum: letzte 14 Tage, Fokus auf die letzte Woche).
    Bitte priorisiere bei der Suche eine breite Vielfalt an Quellen. Suche gezielt auch nach akademischen Pre-Prints (z.B. arXiv) und Nischenpublikationen, nicht nur nach Mainstream-Nachrichten.
    
    **Anforderungen an den Output:**
    1. **Intro**: Eine ausführliche strategische Analyse der Woche (Management Summary).
    2. **Items**: Eine lange Liste (15-20 Einträge) aller relevanten Aktivitäten. Lieber zu viel als zu wenig.
       - WICHTIG: Das Feld "sourceName" muss den konkreten Namen der Publikation enthalten.
       - WICHTIG: "sourceUrl" muss ein funktionierender Link sein.
    3. **Action Steps**: Konkrete Handlungsempfehlungen für Schulleitung/IT.

    Gib das Ergebnis als JSON zurück.
  `;

  onProgress("Deep Search läuft: Durchsuche das Web nach ALLEN Aktivitäten...");

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            intro: { type: Type.STRING, description: "Ausführliche Executive Summary (300+ Wörter) mit Trend-Analyse." },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  sourceUrl: { type: Type.STRING, description: "EXAKTE URL aus dem Suchergebnis." },
                  sourceName: { type: Type.STRING, description: "Name der Publikation/Plattform" },
                  sourceType: { type: Type.STRING, enum: ["Twitter/X", "Paper", "Video/YouTube", "Podcast", "News", "LinkedIn", "Andere"] },
                  expertName: { type: Type.STRING },
                  date: { type: Type.STRING },
                  tags: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING }, 
                    description: "3-5 Schlagworte" 
                  }
                },
                required: ["headline", "summary", "sourceType", "sourceName", "sourceUrl", "expertName", "tags"]
              }
            },
            actionSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["title", "intro", "items", "actionSteps"]
        }
      }
    });

    onProgress("Generiere umfangreichen Report und validiere Links...");

    const jsonText = response.text || "{}";
    const data = JSON.parse(jsonText);

    // Process and validate items
    const items: ReportItem[] = await Promise.all((data.items || []).map(async (item: any) => ({
      ...item,
      linkStatus: await validateLink(item.sourceUrl, item.sourceName)
    })));

    const report: Report = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: data.title || "Umfassendes AI Education Update",
      intro: data.intro || "Zusammenfassung der relevanten Entwicklungen.",
      items: items,
      actionSteps: data.actionSteps || [],
      rawMarkdown: "N/A"
    };

    onProgress("Fertig!");
    return report;

  } catch (error) {
    console.error("Gemini Error:", error);
    onProgress("Fehler beim Abrufen der Daten.");
    throw error;
  }
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