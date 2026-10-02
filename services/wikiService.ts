import { Expert } from '../types';

// Wikipedia liefert Foto + Kurzbiografie kostenlos, ohne API-Key und mit CORS-Freigabe.
// Damit laufen Profil-Updates in Sekunden statt über einzelne Gemini-Anfragen.

type WikiLang = 'de' | 'en';

export interface WikiProfile {
  title: string;
  lang: WikiLang;
  url: string;
  extract: string;
  description?: string;
  imageUrl?: string;
}

interface WikiPage {
  title: string;
  index?: number;
  missing?: boolean;
  invalid?: boolean;
  pageprops?: { disambiguation?: string };
  description?: string;
  extract?: string;
  fullurl?: string;
  thumbnail?: { source: string; width: number; height: number };
}

// Begriffe in der Wikidata-Kurzbeschreibung, die auf eine Person aus dem Tech-/Forschungsumfeld hindeuten.
// Nur für Treffer aus der Volltextsuche relevant, um Namensvettern auszuschließen.
const PERSON_KEYWORDS = [
  'informatik', 'computer', 'scientist', 'wissenschaftler', 'forscher', 'researcher', 'professor',
  'engineer', 'ingenieur', 'entwickler', 'developer', 'programmer', 'unternehmer', 'entrepreneur',
  'executive', 'manager', 'ceo', 'founder', 'gründer', 'youtuber', 'activist', 'aktivist',
  'physicist', 'physiker', 'mathemat', 'psycholog', 'futur', 'ökonom', 'economist', 'ki', 'ai ', 'artificial'
];

export const cleanName = (name: string) => name.replace(/\(.*?\)/g, '').trim();

// Bild-URLs nie selbst zusammenbauen: Wikimedia blockiert seit 2026 Thumbnails in Nicht-Standardgrößen.
// pithumbsize=960 ist eine der Standardstufen; die API liefert dafür eine gültige URL zurück.
const QUERY_PARAMS = [
  'action=query', 'format=json', 'formatversion=2', 'origin=*', 'redirects=1',
  'prop=pageimages|extracts|info|pageprops|description',
  'piprop=thumbnail', 'pithumbsize=960',
  'exintro=1', 'explaintext=1', 'exsentences=6',
  'inprop=url', 'ppprop=disambiguation'
].join('&');

const queryPages = async (lang: WikiLang, params: string): Promise<WikiPage[]> => {
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${QUERY_PARAMS}&${params}`);
  if (!res.ok) throw new Error(`Wikipedia (${lang}) antwortet mit Status ${res.status}`);
  const data = await res.json();
  const pages: WikiPage[] = data?.query?.pages || [];
  return pages
    .filter(p => !p.missing && !p.invalid && p.pageprops?.disambiguation === undefined)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
};

const fetchPage = async (lang: WikiLang, title: string) =>
  (await queryPages(lang, `titles=${encodeURIComponent(title)}`))[0] || null;

const looksLikeExpert = (page: WikiPage) => {
  const text = `${page.description || ''} ${page.extract || ''}`.toLowerCase();
  return PERSON_KEYWORDS.some(k => text.includes(k));
};

const searchPage = async (lang: WikiLang, name: string) => {
  const pages = await queryPages(lang, `generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(name)}`);
  const lastName = name.split(' ').pop()!.toLowerCase();
  return pages.find(p => p.title.toLowerCase().includes(lastName) && looksLikeExpert(p)) || null;
};

const toProfile = (lang: WikiLang, p: WikiPage): WikiProfile => ({
  title: p.title,
  lang,
  url: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
  extract: p.extract || '',
  description: p.description,
  imageUrl: p.thumbnail?.source
});

const findInLanguage = async (lang: WikiLang, name: string): Promise<WikiProfile | null> => {
  const page = (await fetchPage(lang, name)) || (await searchPage(lang, name));
  return page ? toProfile(lang, page) : null;
};

/**
 * Sucht den Wikipedia-Artikel zu einem Experten.
 * Deutsch hat Vorrang (Biografie-Text), fehlt dort ein Foto, wird es aus dem englischen Artikel ergänzt.
 * Netzwerkfehler werden weitergereicht, damit die Oberfläche sie anzeigen kann.
 */
export const lookupExpert = async (expert: Expert): Promise<WikiProfile | null> => {
  if (expert.wikiTitle === '-') return null;

  if (expert.wikiTitle) {
    const match = expert.wikiTitle.match(/^(de|en):(.+)$/);
    const lang: WikiLang = (match?.[1] as WikiLang) || 'de';
    const page = await fetchPage(lang, match ? match[2] : expert.wikiTitle);
    return page ? toProfile(lang, page) : null;
  }

  const name = cleanName(expert.name);
  const de = await findInLanguage('de', name);
  if (de?.imageUrl) return de;

  const en = await findInLanguage('en', name);
  if (!de) return en;
  return { ...de, imageUrl: en?.imageUrl };
};

/**
 * Wandelt eine eingefügte Wikipedia-URL oder einen Artikeltitel in das interne Format "de:Titel" um.
 */
export const normalizeWikiInput = (input: string): string | undefined => {
  const value = input.trim();
  if (!value) return undefined;
  if (value === '-') return '-';
  const url = value.match(/^https?:\/\/(de|en)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/);
  if (url) return `${url[1]}:${decodeURIComponent(url[2])}`;
  if (/^(de|en):/.test(value)) return value;
  return `de:${value}`;
};

// Ersatzbild über das X-Profil, falls es keinen Wikipedia-Artikel mit Foto gibt.
export const socialAvatarUrl = (expert: Expert): string | undefined => {
  const handle = expert.twitterHandle?.replace('@', '').trim();
  return handle ? `https://unavatar.io/x/${handle}` : undefined;
};

export const initialsAvatarUrl = (name: string, size = 256) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName(name))}&background=f4f4f5&color=18181b&size=${size}`;

/**
 * Aktualisiert Foto + Biografie für alle übergebenen Experten parallel (max. 4 gleichzeitig).
 * Manuell gesetzte Bilder bleiben unangetastet.
 */
export const refreshFromWikipedia = async (
  experts: Expert[],
  onResult: (id: string, patch: Partial<Expert>) => void,
  concurrency = 4
): Promise<{ found: number; missing: string[]; failed: string[]; error?: string }> => {
  const queue = [...experts];
  const missing: string[] = [];
  const failed: string[] = [];
  let error: string | undefined;
  let found = 0;

  const worker = async () => {
    while (queue.length) {
      const expert = queue.shift()!;
      let profile: WikiProfile | null = null;
      try {
        profile = await lookupExpert(expert);
      } catch (e: any) {
        // Netzwerk-/Serverfehler: vorhandene Daten behalten, beim nächsten Öffnen erneut versuchen
        console.warn('Wikipedia-Abfrage fehlgeschlagen für', expert.name, e);
        failed.push(expert.name);
        error = e?.message || String(e);
        continue;
      }

      const keepManualImage = expert.imageSource === 'manual' && expert.imageUrl;
      const social = socialAvatarUrl(expert);
      let imageUrl = expert.imageUrl;
      let imageSource = expert.imageSource;
      if (!keepManualImage) {
        if (profile?.imageUrl) {
          imageUrl = profile.imageUrl;
          imageSource = 'wikipedia';
        } else if (social) {
          imageUrl = social;
          imageSource = 'social';
        } else {
          imageUrl = undefined;
          imageSource = undefined;
        }
      }

      if (profile) found++;
      else missing.push(expert.name);

      onResult(expert.id, {
        imageUrl,
        imageSource,
        wikiUrl: profile?.url,
        wikiExtract: profile?.extract,
        wikiFetchedAt: new Date().toISOString()
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, experts.length) }, worker));
  return { found, missing, failed, error };
};

/**
 * Prüft, ob ein News-Item / eine Markierung zu diesem Experten gehört.
 * Akzeptiert vollen Namen, Alias in Klammern (z.B. "The Morpheus") oder den Nachnamen.
 */
export const matchesExpert = (expert: Expert, text: string): boolean => {
  const haystack = text.toLowerCase();
  const name = cleanName(expert.name).toLowerCase();
  if (haystack.includes(name)) return true;
  const alias = expert.name.match(/\((.+?)\)/)?.[1]?.toLowerCase();
  if (alias && haystack.includes(alias)) return true;
  const lastName = name.split(' ').pop()!;
  const escaped = lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return lastName.length >= 4 && new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'iu').test(haystack);
};
