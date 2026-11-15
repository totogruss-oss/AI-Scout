/**
 * Reine Logik hinter dem Deep-Research-Bericht – ohne Netzwerk, damit sie
 * vollständig testbar bleibt (siehe reportPipeline.test.ts).
 *
 * Leitgedanke: Das Modell darf Funde vorschlagen, aber ob ein Fund belegt ist,
 * entscheidet nicht das Modell, sondern der Abgleich mit den Quellen, die die
 * Google-Suche tatsächlich geliefert hat (Grounding-Metadaten).
 */
import { Expert, ReportItem, ReportQuality, SourceRef, Verification, Attribution } from '../types';

/** Zeitraum, in dem ein Fund liegen muss, um in den Bericht zu kommen. */
export const RESEARCH_WINDOW_DAYS = 14;
/** Wenige Personen pro Suchlauf – sonst gehen einzelne in der Suche unter. */
export const MAX_EXPERTS_PER_BATCH = 4;
export const MAX_ITEMS_PER_EXPERT = 3;

export interface ExpertBatch {
  label: string;
  experts: Expert[];
}

/** Ausschnitt der Grounding-Metadaten, den die Pipeline braucht. */
export interface GroundingInfo {
  groundingChunks?: { web?: { uri?: string; title?: string; domain?: string } }[];
  groundingSupports?: {
    groundingChunkIndices?: number[];
    segment?: { startIndex?: number; endIndex?: number; text?: string };
  }[];
}

export interface ParsedBlock {
  fields: Record<string, string>;
  /** Zeichenposition des Blocks im Gesamttext (Ende exklusiv). */
  start: number;
  end: number;
}

export type DropReason = 'zu-alt' | 'ohne-datum' | 'nicht-zuordenbar' | 'unvollstaendig';

export interface BatchResult {
  items: ReportItem[];
  dropped: Record<DropReason, number>;
}

// ---------------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** Lokales Datum als JJJJ-MM-TT (bewusst nicht UTC, sonst kippt es nachts um einen Tag). */
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Liest JJJJ-MM-TT oder TT.MM.JJJJ. Alles andere gilt als „kein Datum". */
export const parseItemDate = (raw: string | undefined): Date | null => {
  if (!raw) return null;
  const text = raw.trim();
  let y: number, m: number, d: number;
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const de = text.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (de) {
    [y, m, d] = [Number(de[3]), Number(de[2]), Number(de[1])];
  } else {
    return null;
  }
  const date = new Date(y, m - 1, d);
  // Verhindert, dass z. B. der 31.02. stillschweigend zum 03.03. wird.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Alter in ganzen Tagen; negativ = liegt in der Zukunft. */
export const ageInDays = (date: Date, today: Date): number =>
  Math.round((startOfDay(today).getTime() - startOfDay(date).getTime()) / 86_400_000);

// ---------------------------------------------------------------------------
// Suchläufe zuschneiden
// ---------------------------------------------------------------------------

/**
 * Teilt die aktiven Personen nach Kategorie in kleine Gruppen. Eine Suche für
 * alle auf einmal liefert erfahrungsgemäß nur Treffer zu den prominentesten Namen.
 */
export const buildBatches = (experts: Expert[], maxPerBatch = MAX_EXPERTS_PER_BATCH): ExpertBatch[] => {
  const groups = new Map<string, Expert[]>();
  for (const expert of experts) {
    if (!expert.active) continue;
    const key = expert.category || 'Weitere';
    groups.set(key, [...(groups.get(key) || []), expert]);
  }

  const batches: ExpertBatch[] = [];
  for (const [category, members] of groups) {
    const parts = Math.ceil(members.length / maxPerBatch);
    const size = Math.ceil(members.length / parts);
    for (let i = 0; i < parts; i++) {
      batches.push({
        label: parts > 1 ? `${category} (${i + 1}/${parts})` : category,
        experts: members.slice(i * size, (i + 1) * size),
      });
    }
  }
  return batches;
};

// ---------------------------------------------------------------------------
// Such-Prompt
// ---------------------------------------------------------------------------

const describeExpert = (e: Expert): string => {
  const details = [
    e.role,
    e.twitterHandle ? `X: ${e.twitterHandle}` : '',
    e.primaryChannels?.length ? `Kanäle: ${e.primaryChannels.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return `- ${e.name}${details ? ` (${details})` : ''}`;
};

export const SEARCH_SYSTEM_PROMPT = `Du bist ein sorgfältiger Rechercheur. Du berichtest ausschließlich, was du in den Suchergebnissen tatsächlich gefunden hast.

Grundsätze:
- Lieber kein Fund als ein unsicherer Fund. Es ist ausdrücklich in Ordnung, zu einer Person nichts zu melden.
- Erfinde niemals Adressen, Daten oder Zitate. Nenne nur Adressen, die in den Suchergebnissen vorkamen.
- Schreibe einer Person nur zu, was sie nachweislich selbst gesagt, geschrieben oder veröffentlicht hat.
- Antworte auf Deutsch und halte dich exakt an das vorgegebene Format.`;

export const buildSearchPrompt = (batch: ExpertBatch, today: Date, windowDays = RESEARCH_WINDOW_DAYS): string => {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - windowDays);
  return `Heute ist der ${toIsoDate(today)}.

Recherchiere mit der Websuche für jede der folgenden Personen einzeln, was sie zwischen dem ${toIsoDate(from)} und dem ${toIsoDate(today)} veröffentlicht oder öffentlich gesagt hat (eigene Beiträge, Blogartikel, Newsletter, Paper, Interviews, Podcasts, Vorträge):

${batch.experts.map(describeExpert).join('\n')}

Regeln:
- Höchstens ${MAX_ITEMS_PER_EXPERT} Funde pro Person, die wichtigsten zuerst.
- Nur Funde mit einem Veröffentlichungsdatum, das du in der Quelle gesehen hast und das im genannten Zeitraum liegt. Ohne sicheres Datum: weglassen.
- Bevorzuge die Originalquelle (eigener Blog, Newsletter, Paper, Video) vor Berichten Dritter.
- Blogartikel und Newsletter zählen beim TYP als News.
- BEZUG gibt an, wie die Person mit der Quelle verbunden ist:
  eigen = von der Person selbst verfasst oder veröffentlicht;
  auftritt = Interview, Podcast oder Vortrag mit der Person;
  bericht = Dritte berichten über die Person oder zitieren sie.

Gib jeden Fund exakt in diesem Format aus, ohne weitere Formatierung:

=== FUND ===
EXPERTE: Name wie in der Liste
DATUM: JJJJ-MM-TT
BEZUG: eigen | auftritt | bericht
TYP: Twitter/X | Paper | Video/YouTube | Podcast | News | LinkedIn | Andere
QUELLE: Name der Publikation oder Plattform
URL: Adresse aus den Suchergebnissen
TITEL: sachliche Überschrift
TAGS: 3 bis 5 Schlagworte, durch Komma getrennt
ZUSAMMENFASSUNG: 2 bis 4 Sätze – was wurde gesagt oder veröffentlicht, und warum ist es relevant?

Wenn du zu einer Person nichts Belegbares findest, schreibe stattdessen eine Zeile:
=== KEINE FUNDE: Name ===

Schreibe keine Einleitung und kein Fazit.`;
};

// ---------------------------------------------------------------------------
// Antwort lesen
// ---------------------------------------------------------------------------

const FIELD_ALIASES: Record<string, string> = {
  experte: 'experte', expertin: 'experte', person: 'experte',
  datum: 'datum', date: 'datum',
  bezug: 'bezug',
  typ: 'typ', type: 'typ',
  quelle: 'quelle',
  url: 'url', link: 'url',
  titel: 'titel', headline: 'titel', 'überschrift': 'titel',
  tags: 'tags', schlagworte: 'tags',
  zusammenfassung: 'zusammenfassung', summary: 'zusammenfassung',
};

const FIELD_LINE = /^[\s>*_#-]*([A-Za-zÄÖÜäöü]+)\**\s*:\**\s*(.*)$/;
const SEPARATOR_LINE = /^[\s#*=_-]*FUND\b[\s#*=_:\d-]*$/i;
const NO_FINDINGS_LINE = /KEINE\s+FUNDE/i;

/**
 * Zerlegt die Modellantwort in Fund-Blöcke. Bewusst nachsichtig: Modelle halten
 * sich nicht immer exakt ans Format (Fettdruck, fehlende Trennzeile, …).
 */
export const parseBlocks = (text: string): ParsedBlock[] => {
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock | null = null;
  let lastKey: string | null = null;
  let offset = 0;

  const close = (end: number) => {
    if (current && Object.keys(current.fields).length > 0) {
      current.end = end;
      blocks.push(current);
    }
    current = null;
    lastKey = null;
  };

  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;

    if (NO_FINDINGS_LINE.test(line)) { close(lineStart); continue; }
    if (SEPARATOR_LINE.test(line)) {
      close(lineStart);
      current = { fields: {}, start: lineStart, end: lineStart };
      continue;
    }

    const match = line.match(FIELD_LINE);
    const key = match ? FIELD_ALIASES[match[1].toLowerCase()] : undefined;
    if (key) {
      // Fehlt die Trennzeile, beginnt mit dem nächsten „EXPERTE:" ein neuer Fund.
      if (key === 'experte' && current?.fields.experte) close(lineStart);
      if (!current) current = { fields: {}, start: lineStart, end: lineStart };
      current.fields[key] = match![2].trim();
      lastKey = key;
    } else if (current && lastKey && line.trim()) {
      // Fortsetzungszeile (z. B. mehrzeilige Zusammenfassung)
      current.fields[lastKey] = `${current.fields[lastKey]} ${line.trim()}`.trim();
    }
  }
  close(text.length);
  return blocks;
};

/** Holt die Adresse aus „[Text](https://…)", „<https://…>" oder Klartext. */
export const cleanUrl = (raw: string | undefined): string => {
  if (!raw) return '';
  const match = raw.match(/https?:\/\/[^\s<>()\[\]"']+/);
  if (!match) return '';
  return match[0].replace(/[.,;:!?*]+$/, '');
};

const stripMarkup = (value: string | undefined): string =>
  (value || '').replace(/\*\*/g, '').replace(/^["„“]+|["“”]+$/g, '').trim();

const SOURCE_TYPES: ReportItem['sourceType'][] =
  ['Twitter/X', 'Paper', 'Video/YouTube', 'Podcast', 'News', 'LinkedIn', 'Andere'];

const normalizeSourceType = (raw: string | undefined): ReportItem['sourceType'] => {
  const text = (raw || '').toLowerCase();
  if (/twitter|\bx\b/.test(text)) return 'Twitter/X';
  if (/paper|arxiv|preprint|studie/.test(text)) return 'Paper';
  if (/video|youtube/.test(text)) return 'Video/YouTube';
  if (/podcast/.test(text)) return 'Podcast';
  if (/linkedin/.test(text)) return 'LinkedIn';
  if (/news|artikel|blog|newsletter/.test(text)) return 'News';
  return SOURCE_TYPES.find(t => t.toLowerCase() === text) || 'Andere';
};

const normalizeAttribution = (raw: string | undefined): Attribution | undefined => {
  const text = (raw || '').toLowerCase();
  if (text.includes('eigen')) return 'eigen';
  if (text.includes('auftritt') || text.includes('interview')) return 'auftritt';
  if (text.includes('bericht')) return 'bericht';
  return undefined;
};

const simplify = (name: string) =>
  name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Ordnet den vom Modell genannten Namen einer Person aus dem Suchlauf zu. */
export const matchExpert = (raw: string | undefined, experts: Expert[]): Expert | undefined => {
  const needle = simplify(stripMarkup(raw));
  if (!needle) return undefined;
  const exact = experts.find(e => simplify(e.name) === needle);
  if (exact) return exact;
  const partial = experts.filter(e => {
    const name = simplify(e.name);
    return needle.includes(name) || name.includes(needle);
  });
  if (partial.length === 1) return partial[0];
  // Letzter Versuch: eindeutiger Nachname
  const byLastName = experts.filter(e => needle.split(' ').includes(simplify(e.name).split(' ').pop()!));
  return byLastName.length === 1 ? byLastName[0] : undefined;
};

// ---------------------------------------------------------------------------
// Belege zuordnen
// ---------------------------------------------------------------------------

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Die Suche liefert Weiterleitungs-Adressen; die echte Domain steht im Titel. */
const isRedirectHost = (host: string) => host.includes('vertexaisearch') || host.endsWith('googleusercontent.com');

/** Domains, für die eine Quelle steht (aus domain-Feld, Titel oder Adresse). */
const chunkHosts = (chunk: NonNullable<GroundingInfo['groundingChunks']>[number]): string[] => {
  const hosts: string[] = [];
  const web = chunk.web;
  if (!web) return hosts;
  if (web.domain) hosts.push(web.domain.toLowerCase().replace(/^www\./, ''));
  const title = (web.title || '').toLowerCase().trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(title)) hosts.push(title.replace(/^www\./, ''));
  const uriHost = web.uri ? hostOf(web.uri) : '';
  if (uriHost && !isRedirectHost(uriHost)) hosts.push(uriHost);
  return hosts;
};

/** „blog.example.com" und „example.com" gelten als dieselbe Quelle. */
export const sameSite = (a: string, b: string): boolean =>
  !!a && !!b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));

const byteToCharIndex = (text: string, byteIndex: number): number => {
  const bytes = new TextEncoder().encode(text);
  return new TextDecoder().decode(bytes.slice(0, Math.min(byteIndex, bytes.length))).length;
};

/** Zeichenposition eines belegten Textabschnitts im Gesamttext (oder -1). */
const locateSegment = (text: string, segment: { startIndex?: number; text?: string } | undefined): number => {
  if (!segment) return -1;
  const snippet = segment.text?.trim();
  if (snippet) {
    const first = text.indexOf(snippet);
    // Nur verwenden, wenn der Abschnitt eindeutig ist – sonst über die Position gehen.
    if (first !== -1 && text.indexOf(snippet, first + 1) === -1) return first;
    if (first !== -1 && segment.startIndex === undefined) return first;
  }
  return segment.startIndex !== undefined ? byteToCharIndex(text, segment.startIndex) : -1;
};

/**
 * Ordnet jedem Block die Suchquellen zu, die genau seinen Text stützen.
 * Rückgabe: je Block eine Liste von Quellen (ohne Dubletten).
 */
export const sourcesPerBlock = (text: string, blocks: ParsedBlock[], grounding: GroundingInfo | undefined): SourceRef[][] => {
  const result: SourceRef[][] = blocks.map(() => []);
  const chunks = grounding?.groundingChunks || [];
  for (const support of grounding?.groundingSupports || []) {
    const position = locateSegment(text, support.segment);
    if (position < 0) continue;
    const blockIndex = blocks.findIndex(b => position >= b.start && position < b.end);
    if (blockIndex < 0) continue;
    for (const chunkIndex of support.groundingChunkIndices || []) {
      const web = chunks[chunkIndex]?.web;
      if (!web?.uri) continue;
      if (result[blockIndex].some(s => s.uri === web.uri)) continue;
      result[blockIndex].push({ title: web.title || hostOf(web.uri) || 'Quelle', uri: web.uri });
    }
  }
  return result;
};

/**
 * Drei Stufen, damit auf einen Blick klar ist, wie viel Vertrauen ein Eintrag verdient:
 *  - belegt:    Die Suche stützt genau diesen Eintrag, und zwar mit einer Quelle
 *               von derselben Website wie der angegebene Link.
 *  - teilweise: Die Suche stützt den Eintrag über eine andere Website, oder die
 *               Website des Links kam in der Suche vor, aber nicht zu diesem Eintrag.
 *  - unbelegt:  Kein Suchtreffer stützt den Eintrag. Nicht ungeprüft verwenden.
 */
export const classify = (
  itemUrl: string,
  blockSources: SourceRef[],
  grounding: GroundingInfo | undefined,
): Verification => {
  const itemHost = hostOf(itemUrl);
  const chunks = grounding?.groundingChunks || [];
  const hostsOf = (uri: string) => {
    const chunk = chunks.find(c => c.web?.uri === uri);
    return chunk ? chunkHosts(chunk) : [];
  };

  if (blockSources.length > 0) {
    const sameSiteSupport = blockSources.some(s => hostsOf(s.uri).some(h => sameSite(h, itemHost)));
    return sameSiteSupport ? 'belegt' : 'teilweise';
  }
  const siteSeenInSearch = chunks.some(c => chunkHosts(c).some(h => sameSite(h, itemHost)));
  return siteSeenInSearch ? 'teilweise' : 'unbelegt';
};

// ---------------------------------------------------------------------------
// Ein Suchlauf: Text + Belege -> geprüfte Einträge
// ---------------------------------------------------------------------------

const emptyDrops = (): Record<DropReason, number> =>
  ({ 'zu-alt': 0, 'ohne-datum': 0, 'nicht-zuordenbar': 0, 'unvollstaendig': 0 });

export const processBatchResponse = (
  text: string,
  grounding: GroundingInfo | undefined,
  batch: ExpertBatch,
  today: Date,
  windowDays = RESEARCH_WINDOW_DAYS,
): BatchResult => {
  const blocks = parseBlocks(text);
  const sources = sourcesPerBlock(text, blocks, grounding);
  const dropped = emptyDrops();
  const items: ReportItem[] = [];

  blocks.forEach((block, index) => {
    const f = block.fields;
    const expert = matchExpert(f.experte, batch.experts);
    if (!expert) { dropped['nicht-zuordenbar']++; return; }

    const headline = stripMarkup(f.titel);
    const summary = stripMarkup(f.zusammenfassung);
    if (!headline || !summary) { dropped.unvollstaendig++; return; }

    const date = parseItemDate(f.datum);
    if (!date) { dropped['ohne-datum']++; return; }
    const age = ageInDays(date, today);
    // Ein Tag Toleranz nach vorn wegen Zeitzonen; alles Weitere ist ein Datumsfehler.
    if (age < -1) { dropped['ohne-datum']++; return; }
    if (age > windowDays) { dropped['zu-alt']++; return; }

    const sourceUrl = cleanUrl(f.url);
    items.push({
      headline,
      summary,
      sourceUrl,
      sourceName: stripMarkup(f.quelle) || hostOf(sourceUrl) || 'Quelle',
      sourceType: normalizeSourceType(f.typ),
      expertName: expert.name,
      date: toIsoDate(date),
      tags: (f.tags || '').split(/[,;]/).map(t => stripMarkup(t).replace(/^#/, '')).filter(Boolean).slice(0, 5),
      verification: classify(sourceUrl, sources[index], grounding),
      groundedSources: sources[index],
      attribution: normalizeAttribution(f.bezug),
    });
  });

  return { items, dropped };
};

// ---------------------------------------------------------------------------
// Zusammenführen
// ---------------------------------------------------------------------------

const RANK: Record<Verification, number> = { belegt: 0, teilweise: 1, unbelegt: 2 };

const dedupeKey = (item: ReportItem): string => {
  if (item.sourceUrl) {
    try {
      const url = new URL(item.sourceUrl);
      [...url.searchParams.keys()].filter(k => /^utm_|^ref$|^fbclid$/.test(k)).forEach(k => url.searchParams.delete(k));
      url.hash = '';
      return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}${url.search}`.toLowerCase();
    } catch { /* fällt auf Überschrift zurück */ }
  }
  return `${item.expertName}|${item.headline}`.toLowerCase();
};

/** Entfernt Dubletten (der besser belegte Eintrag bleibt) und sortiert. */
export const mergeItems = (items: ReportItem[]): ReportItem[] => {
  const unique = new Map<string, ReportItem>();
  for (const item of items) {
    const key = dedupeKey(item);
    const existing = unique.get(key);
    if (!existing || RANK[item.verification || 'unbelegt'] < RANK[existing.verification || 'unbelegt']) {
      unique.set(key, item);
    }
  }
  // Unbelegtes ans Ende, sonst Neuestes zuerst.
  return [...unique.values()].sort((a, b) => {
    const aUnproven = a.verification === 'unbelegt' ? 1 : 0;
    const bUnproven = b.verification === 'unbelegt' ? 1 : 0;
    return aUnproven - bUnproven || b.date.localeCompare(a.date);
  });
};

export interface QualityInput {
  items: ReportItem[];
  searchedExperts: Expert[];
  failedExperts: Expert[];
  dropped: Record<DropReason, number>[];
  windowDays?: number;
}

export const buildQuality = ({ items, searchedExperts, failedExperts, dropped, windowDays = RESEARCH_WINDOW_DAYS }: QualityInput): ReportQuality => {
  const withFindings = new Set(items.map(i => i.expertName));
  const sum = (reason: DropReason) => dropped.reduce((total, d) => total + d[reason], 0);
  return {
    windowDays,
    searched: searchedExperts.length,
    withoutFindings: searchedExperts.map(e => e.name).filter(name => !withFindings.has(name)),
    notChecked: failedExperts.map(e => e.name),
    belegt: items.filter(i => i.verification === 'belegt').length,
    teilweise: items.filter(i => i.verification === 'teilweise').length,
    unbelegt: items.filter(i => i.verification === 'unbelegt').length,
    droppedTooOld: sum('zu-alt'),
    droppedNoDate: sum('ohne-datum'),
    droppedOther: sum('nicht-zuordenbar') + sum('unvollstaendig'),
  };
};

// ---------------------------------------------------------------------------
// Zusammenfassung (zweiter Schritt, ohne Suche)
// ---------------------------------------------------------------------------

export const SYNTHESIS_SYSTEM_PROMPT = `Du bist Analyst für Künstliche Intelligenz und schreibst für eine Lehrkraft, die an ihrer Schule für IT und KI zuständig ist.

Du bekommst eine Liste geprüfter Funde. Arbeite ausschließlich mit dieser Liste:
- Füge keine Ereignisse, Zahlen, Zitate oder Quellen hinzu, die nicht in der Liste stehen.
- Einträge mit "beleg": "unbelegt" darfst du erwähnen, aber nicht zur Grundlage einer Empfehlung machen.
- Wenn die Liste wenig hergibt, sag das in einem Satz, statt zu strecken.
- Schreibe nüchtern und konkret, auf Deutsch.`;

export const buildSynthesisPrompt = (items: ReportItem[], today: Date, windowDays = RESEARCH_WINDOW_DAYS): string => {
  const list = items.map((item, index) => ({
    nr: index + 1,
    person: item.expertName,
    datum: item.date,
    titel: item.headline,
    inhalt: item.summary,
    beleg: item.verification || 'unbelegt',
  }));
  return `Heute ist der ${toIsoDate(today)}. Die folgenden ${items.length} Funde stammen aus den letzten ${windowDays} Tagen:

${JSON.stringify(list, null, 1)}

Erstelle daraus:
1. title: eine sachliche Überschrift (höchstens 8 Wörter), die das wichtigste Thema benennt.
2. intro: eine Einordnung in 120 bis 200 Wörtern. Welche Linien ziehen sich durch die Funde? Wo widersprechen sich die Personen? Was davon ist für Schule und Unterricht relevant?
3. actionSteps: 2 bis 4 konkrete, kleine Handlungsimpulse für Schulleitung und IT. Jeder Impuls nennt in Klammern die Nummern der Funde, auf die er sich stützt, z. B. "(Funde 2, 5)".`;
};

/** Bericht ohne einen einzigen Fund – ehrlich benennen statt etwas zu erfinden. */
export const EMPTY_REPORT_TEXT = {
  title: 'Keine belegten Funde',
  intro: `Die Suche hat für die letzten ${RESEARCH_WINDOW_DAYS} Tage keine Beiträge gefunden, die sich mit Datum und Quelle belegen lassen. Das kann an einer ruhigen Phase liegen oder daran, dass die Suche einzelne Kanäle (etwa X oder LinkedIn) kaum erfasst. Unten steht, zu wem gesucht wurde.`,
};
