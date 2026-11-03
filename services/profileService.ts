import { DataOrigin, Expert, ExpertLink, ExpertLinkType } from '../types';

/**
 * Profilanreicherung aus offenen, strukturierten Quellen (Wikipedia + Wikidata).
 *
 * Warum nicht (nur) die KI? Sprachmodelle erfinden Bild-URLs und Social-Handles
 * zuverlässig falsch. Wikidata pflegt genau diese Daten strukturiert und
 * verifiziert (Website, X, LinkedIn, Bluesky, GitHub, YouTube, Google Scholar,
 * Bild auf Wikimedia Commons). Beide APIs erlauben Browser-Zugriffe (CORS).
 */

const ORIGIN_RANK: Record<DataOrigin, number> = {
  manuell: 5,
  kuratiert: 4,
  wikidata: 3,
  wikipedia: 2,
  ki: 1,
};

/** Link-Typen, von denen es pro Person sinnvollerweise nur einen gibt. */
const SINGLE_VALUE_TYPES: ExpertLinkType[] = [
  'x', 'linkedin', 'bluesky', 'mastodon', 'threads', 'github', 'scholar', 'wikipedia',
];

export const LINK_TYPE_LABELS: Record<ExpertLinkType, string> = {
  website: 'Website',
  x: 'X / Twitter',
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  threads: 'Threads',
  github: 'GitHub',
  youtube: 'YouTube',
  scholar: 'Google Scholar',
  substack: 'Substack',
  blog: 'Blog / Newsletter',
  podcast: 'Podcast',
  wikipedia: 'Wikipedia',
  other: 'Weitere',
};

export const ORIGIN_LABELS: Record<DataOrigin, string> = {
  kuratiert: 'Kuratiert',
  wikidata: 'Wikidata',
  wikipedia: 'Wikipedia',
  ki: 'KI-Vorschlag (unverifiziert)',
  manuell: 'Manuell',
};

const normalizeUrl = (url: string) =>
  url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

export const isSafeHttpUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Führt Linklisten zusammen. Bei Einzelwert-Typen (z. B. X) gewinnt die
 * vertrauenswürdigere Quelle; ansonsten wird nach URL dedupliziert.
 */
export const mergeLinks = (existing: ExpertLink[] = [], incoming: ExpertLink[] = []): ExpertLink[] => {
  const result: ExpertLink[] = [...existing.filter(l => isSafeHttpUrl(l.url))];

  for (const candidate of incoming) {
    if (!isSafeHttpUrl(candidate.url)) continue;
    const sameUrlIdx = result.findIndex(l => normalizeUrl(l.url) === normalizeUrl(candidate.url));
    if (sameUrlIdx >= 0) {
      // Gleiche URL: höhere Vertrauensstufe übernehmen (z. B. KI-Vorschlag → von Wikidata bestätigt).
      if (ORIGIN_RANK[candidate.origin] > ORIGIN_RANK[result[sameUrlIdx].origin]) {
        result[sameUrlIdx] = { ...result[sameUrlIdx], origin: candidate.origin };
      }
      continue;
    }
    if (SINGLE_VALUE_TYPES.includes(candidate.type)) {
      const sameTypeIdx = result.findIndex(l => l.type === candidate.type);
      if (sameTypeIdx >= 0) {
        if (ORIGIN_RANK[candidate.origin] > ORIGIN_RANK[result[sameTypeIdx].origin]) {
          result[sameTypeIdx] = candidate;
        }
        continue;
      }
    }
    result.push(candidate);
  }
  return result;
};

/** Fallback-Avatar mit Initialen (keine externe Abhängigkeit für Personenbilder). */
export const initialsAvatar = (name: string, size = 256) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f4f4f5&color=18181b&size=${size}`;

// ---------------------------------------------------------------------------
// Wikipedia
// ---------------------------------------------------------------------------

interface WikiSummary {
  title: string;
  extract?: string;
  description?: string;
  thumbnail?: { source: string };
  originalimage?: { source: string };
  content_urls?: { desktop?: { page?: string } };
  wikibase_item?: string;
  type?: string;
}

const fetchJson = async <T,>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const fetchWikiSummary = (lang: string, title: string) =>
  fetchJson<WikiSummary>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
  );

// ---------------------------------------------------------------------------
// Wikidata
// ---------------------------------------------------------------------------

interface WikidataEntity {
  id: string;
  claims: Record<string, Array<{ mainsnak?: { datavalue?: { value: any } }; rank?: string }>>;
  sitelinks?: Record<string, { title: string; url?: string }>;
  descriptions?: Record<string, { value: string }>;
}

const claimValues = (entity: WikidataEntity, prop: string): any[] =>
  (entity.claims[prop] || [])
    .filter(c => c.rank !== 'deprecated')
    .map(c => c.mainsnak?.datavalue?.value)
    .filter(v => v !== undefined && v !== null);

const firstString = (entity: WikidataEntity, prop: string): string | undefined => {
  const v = claimValues(entity, prop)[0];
  return typeof v === 'string' ? v : undefined;
};

const fetchWikidataEntity = async (qid: string): Promise<WikidataEntity | null> => {
  const data = await fetchJson<{ entities: Record<string, WikidataEntity> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`
  );
  if (!data) return null;
  // Weiterleitungen: Die Antwort enthält dann die Ziel-ID.
  return data.entities[qid] || Object.values(data.entities)[0] || null;
};

const isHuman = (entity: WikidataEntity) =>
  claimValues(entity, 'P31').some((v: any) => v?.id === 'Q5');

/** Begriffe in Wikidata-Beschreibungen, die auf eine Person aus dem KI-/Tech-/Bildungsumfeld hindeuten. */
const RELEVANCE_HINTS = [
  'artificial intelligence', 'künstliche intelligenz', ' ai ', 'machine learning', 'computer',
  'informatik', 'software', 'scientist', 'wissenschaftler', 'researcher', 'forscher', 'engineer',
  'ingenieur', 'entrepreneur', 'unternehmer', 'professor', 'educator', 'pädagog', 'bildung',
  'youtuber', 'programmer', 'programmierer', 'developer', 'entwickler', 'futurist', 'zukunftsforscher',
  'economist', 'ökonom', 'psycholog', 'executive', 'manager',
];

/**
 * Sucht eine Person auf Wikidata per Name. Übernommen wird nur ein Mensch, dessen
 * Beschreibung zum KI-/Tech-/Bildungsumfeld passt – sonst lieber kein Treffer als
 * ein falscher (z. B. gleichnamige Sportler oder Musiker).
 */
const searchWikidataPerson = async (name: string): Promise<WikidataEntity | null> => {
  const cleanName = name.replace(/\(.*?\)/g, '').trim();
  const data = await fetchJson<{ search: Array<{ id: string; description?: string }> }>(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanName)}` +
      `&language=de&uselang=de&type=item&limit=7&format=json&origin=*`
  );
  for (const hit of data?.search || []) {
    const desc = ` ${(hit.description || '').toLowerCase()} `;
    if (!RELEVANCE_HINTS.some(h => desc.includes(h))) continue;
    const entity = await fetchWikidataEntity(hit.id);
    if (entity && isHuman(entity)) return entity;
  }
  return null;
};

const wikidataLinks = (entity: WikidataEntity): ExpertLink[] => {
  const links: ExpertLink[] = [];
  const add = (type: ExpertLinkType, url?: string, label?: string) => {
    if (url) links.push({ type, url, label, origin: 'wikidata' });
  };

  // P856 offizielle Website (kann mehrfach vorkommen)
  claimValues(entity, 'P856').slice(0, 2).forEach((url: string) => add('website', url));

  const x = firstString(entity, 'P2002');
  if (x) add('x', `https://x.com/${x}`);

  const linkedin = firstString(entity, 'P6634');
  if (linkedin) add('linkedin', `https://www.linkedin.com/in/${linkedin}/`);

  const bluesky = firstString(entity, 'P12361');
  if (bluesky) add('bluesky', `https://bsky.app/profile/${bluesky}`);

  const mastodon = firstString(entity, 'P4033');
  if (mastodon && mastodon.includes('@')) {
    const [user, server] = mastodon.replace(/^@/, '').split('@');
    if (user && server) add('mastodon', `https://${server}/@${user}`);
  }

  const github = firstString(entity, 'P2037');
  if (github) add('github', `https://github.com/${github}`);

  const youtube = firstString(entity, 'P2397');
  if (youtube) add('youtube', `https://www.youtube.com/channel/${youtube}`);

  const scholar = firstString(entity, 'P1960');
  if (scholar) add('scholar', `https://scholar.google.com/citations?user=${scholar}`);

  return links;
};

const commonsImage = (entity: WikidataEntity): { url: string; credit: string } | null => {
  const file = firstString(entity, 'P18');
  if (!file) return null;
  const encoded = encodeURIComponent(file.replace(/ /g, '_'));
  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=800`,
    credit: `Wikimedia Commons: ${file}`,
  };
};

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

export interface OpenDataProfile {
  wikidataId?: string;
  wikipediaTitle?: string;
  wikipediaLang?: 'de' | 'en';
  wikipediaUrl?: string;
  bio?: string;
  shortDescription?: string;
  imageUrl?: string;
  imageCredit?: string;
  imageOrigin?: DataOrigin;
  links: ExpertLink[];
  birthYear?: string;
  found: boolean;
}

/**
 * Holt verifizierte Profildaten. Reihenfolge:
 * 1. Wikidata-ID (falls gespeichert) → 2. Wikipedia-Titel → 3. Namenssuche.
 * Bevorzugt die deutsche Wikipedia für die Biografie.
 */
export const fetchOpenDataProfile = async (expert: Expert): Promise<OpenDataProfile> => {
  let entity: WikidataEntity | null = null;
  let seedSummary: WikiSummary | null = null;

  if (expert.wikidataId) {
    entity = await fetchWikidataEntity(expert.wikidataId);
  }
  if (!entity && expert.wikipediaTitle) {
    seedSummary = await fetchWikiSummary(expert.wikipediaLang || 'en', expert.wikipediaTitle);
    if (seedSummary?.wikibase_item) entity = await fetchWikidataEntity(seedSummary.wikibase_item);
  }
  if (!entity) {
    entity = await searchWikidataPerson(expert.name);
  }

  if (!entity) {
    // Nur Wikipedia ohne Wikidata (selten) – trotzdem Bio & Bild nutzen.
    if (seedSummary?.extract) {
      return {
        found: true,
        wikipediaTitle: seedSummary.title,
        wikipediaLang: expert.wikipediaLang,
        wikipediaUrl: seedSummary.content_urls?.desktop?.page,
        bio: seedSummary.extract,
        imageUrl: seedSummary.originalimage?.source || seedSummary.thumbnail?.source,
        imageOrigin: 'wikipedia',
        imageCredit: 'Wikipedia',
        links: [],
      };
    }
    return { found: false, links: [] };
  }

  // Biografie: deutsche Wikipedia bevorzugt, sonst englische.
  let summary: WikiSummary | null = null;
  let lang: 'de' | 'en' | undefined;
  for (const l of ['de', 'en'] as const) {
    const title = entity.sitelinks?.[`${l}wiki`]?.title;
    if (!title) continue;
    summary = seedSummary && seedSummary.title.replace(/_/g, ' ') === title && expert.wikipediaLang === l
      ? seedSummary
      : await fetchWikiSummary(l, title);
    if (summary?.extract) { lang = l; break; }
  }

  const links = wikidataLinks(entity);
  const wikipediaUrl = summary?.content_urls?.desktop?.page;
  if (wikipediaUrl) links.push({ type: 'wikipedia', url: wikipediaUrl, origin: 'wikidata' });

  const commons = commonsImage(entity);
  const wikiImage = summary?.originalimage?.source || summary?.thumbnail?.source;

  const birth = claimValues(entity, 'P569')[0]?.time as string | undefined; // "+1976-04-09T00:00:00Z"
  const birthYear = birth?.match(/^[+-]?(\d{4})/)?.[1];

  return {
    found: true,
    wikidataId: entity.id,
    wikipediaTitle: summary?.title,
    wikipediaLang: lang,
    wikipediaUrl,
    bio: summary?.extract,
    shortDescription: entity.descriptions?.de?.value || entity.descriptions?.en?.value,
    imageUrl: commons?.url || wikiImage,
    imageCredit: commons?.credit || (wikiImage ? 'Wikipedia' : undefined),
    imageOrigin: commons ? 'wikidata' : wikiImage ? 'wikipedia' : undefined,
    links,
    birthYear,
  };
};

/**
 * Übernimmt Open-Data-Ergebnisse in ein Expertenprofil, ohne manuell
 * gepflegte Felder zu überschreiben.
 */
export const applyOpenDataProfile = (expert: Expert, data: OpenDataProfile): Expert => {
  if (!data.found) return { ...expert, enrichedAt: new Date().toISOString() };

  const keepImage = expert.manualOverrides?.imageUrl && expert.imageUrl;
  const keepLinks = expert.manualOverrides?.links;

  return {
    ...expert,
    wikidataId: data.wikidataId || expert.wikidataId,
    wikipediaTitle: data.wikipediaTitle || expert.wikipediaTitle,
    wikipediaLang: data.wikipediaLang || expert.wikipediaLang,
    // Wikipedia-Bio nur übernehmen, wenn keine manuelle Bio existiert.
    bio: expert.bioOrigin === 'manuell' ? expert.bio : (data.bio || expert.bio),
    bioOrigin: expert.bioOrigin === 'manuell' ? 'manuell' : (data.bio ? 'wikipedia' : expert.bioOrigin),
    imageUrl: keepImage ? expert.imageUrl : (data.imageUrl || expert.imageUrl),
    imageOrigin: keepImage ? expert.imageOrigin : (data.imageUrl ? data.imageOrigin : expert.imageOrigin),
    imageCredit: keepImage ? expert.imageCredit : (data.imageUrl ? data.imageCredit : expert.imageCredit),
    links: keepLinks ? mergeLinks(expert.links, []) : mergeLinks(expert.links, data.links),
    enrichedAt: new Date().toISOString(),
  };
};

/** Zählt, wie oft eine Person in gespeicherten Reports vorkommt (Ertrag pro Quelle). */
export const matchesExpertName = (expertName: string, candidate: string) => {
  const a = expertName.replace(/\(.*?\)/g, '').trim().toLowerCase();
  const b = candidate.replace(/\(.*?\)/g, '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
};
