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

interface WikiSummary {
  type: string;
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page?: string } };
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

const fetchSummary = async (lang: WikiLang, title: string): Promise<WikiSummary | null> => {
  const res = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
  );
  if (!res.ok) return null;
  const data: WikiSummary = await res.json();
  if (data.type === 'disambiguation') return null;
  return data;
};

const searchTitle = async (lang: WikiLang, name: string): Promise<string | null> => {
  const res = await fetch(
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&origin=*&srsearch=${encodeURIComponent(name)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const lastName = name.split(' ').pop()!.toLowerCase();
  const hit = (data?.query?.search || []).find((r: { title: string }) => r.title.toLowerCase().includes(lastName));
  return hit?.title || null;
};

const looksLikeExpert = (summary: WikiSummary) => {
  const text = `${summary.description || ''} ${summary.extract || ''}`.toLowerCase();
  return PERSON_KEYWORDS.some(k => text.includes(k));
};

// Große Originalbilder (teils > 5 MB) vermeiden: ab 1200px die Wikimedia-Thumbnail-Variante nehmen.
const pickImage = (summary: WikiSummary): string | undefined => {
  const original = summary.originalimage;
  if (original && original.width <= 1200) return original.source;
  if (summary.thumbnail) return summary.thumbnail.source.replace(/\/\d+px-/, '/800px-');
  return original?.source;
};

const toProfile = (lang: WikiLang, s: WikiSummary): WikiProfile => ({
  title: s.title,
  lang,
  url: s.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(s.title)}`,
  extract: s.extract || '',
  description: s.description,
  imageUrl: pickImage(s)
});

const findInLanguage = async (lang: WikiLang, name: string): Promise<WikiProfile | null> => {
  const direct = await fetchSummary(lang, name);
  if (direct) return toProfile(lang, direct);

  const title = await searchTitle(lang, name);
  if (!title) return null;
  const found = await fetchSummary(lang, title);
  return found && looksLikeExpert(found) ? toProfile(lang, found) : null;
};

/**
 * Sucht den Wikipedia-Artikel zu einem Experten.
 * Deutsch hat Vorrang (Biografie-Text), fehlt dort ein Foto, wird es aus dem englischen Artikel ergänzt.
 */
export const lookupExpert = async (expert: Expert): Promise<WikiProfile | null> => {
  if (expert.wikiTitle === '-') return null;

  if (expert.wikiTitle) {
    const match = expert.wikiTitle.match(/^(de|en):(.+)$/);
    const lang: WikiLang = (match?.[1] as WikiLang) || 'de';
    const summary = await fetchSummary(lang, match ? match[2] : expert.wikiTitle);
    return summary ? toProfile(lang, summary) : null;
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
): Promise<{ found: number; missing: string[] }> => {
  const queue = [...experts];
  const missing: string[] = [];
  let found = 0;

  const worker = async () => {
    while (queue.length) {
      const expert = queue.shift()!;
      let profile: WikiProfile | null = null;
      try {
        profile = await lookupExpert(expert);
      } catch (e) {
        console.warn('Wikipedia-Abfrage fehlgeschlagen für', expert.name, e);
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
  return { found, missing };
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
