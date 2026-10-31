/** Herkunft einer Information – wichtig für Quellen-Transparenz im Profil. */
export type DataOrigin = 'kuratiert' | 'wikidata' | 'wikipedia' | 'ki' | 'manuell';

export type ExpertLinkType =
  | 'website' | 'x' | 'linkedin' | 'bluesky' | 'mastodon' | 'threads'
  | 'github' | 'youtube' | 'scholar' | 'substack' | 'blog' | 'podcast' | 'wikipedia' | 'other';

export interface ExpertLink {
  type: ExpertLinkType;
  url: string;
  label?: string;
  origin: DataOrigin;
}

export type ExpertCategory =
  | 'Frontier-Labs & Industrie'
  | 'Grundlagenforschung'
  | 'Sicherheit & Governance'
  | 'Kritik & Ethik'
  | 'Praxis & Engineering'
  | 'Bildung & DACH';

export interface ExpertMilestone {
  year: string;
  text: string;
}

export interface Expert {
  id: string;
  name: string;
  role: string;
  company?: string;
  topics: string[];
  twitterHandle?: string;
  active: boolean;
  description?: string;
  relevance?: string;
  lastUpdated?: string;
  imageUrl?: string;

  // --- Erweiterte Profildaten (Profilseite) ---
  category?: ExpertCategory;
  /** Wikidata-ID (z. B. "Q92894"). Schlüssel für verifizierte Links & Bilder. */
  wikidataId?: string;
  /** Wikipedia-Seitentitel (de oder en), für Kurzbiografie & Bild. */
  wikipediaTitle?: string;
  wikipediaLang?: 'de' | 'en';
  /** Kuratierte Kernaussage: Warum folge ich dieser Person? */
  whyFollow?: string;
  links?: ExpertLink[];
  /** Längere Biografie (Wikipedia-Auszug oder KI-Recherche). */
  bio?: string;
  bioOrigin?: DataOrigin;
  imageOrigin?: DataOrigin;
  imageCredit?: string;
  milestones?: ExpertMilestone[];
  keyWorks?: string[];
  currentFocus?: string;
  positions?: string;
  /** Primärer Kanal, über den die Person tatsächlich publiziert. */
  primaryChannels?: string[];
  /** Vom Nutzer gesperrte Felder werden bei Aktualisierungen nicht überschrieben. */
  manualOverrides?: { imageUrl?: boolean; links?: boolean };
  enrichedAt?: string;
}

export type LinkStatus = 'accessible' | 'paywall' | 'warning';

export interface ReportItem {
  headline: string;
  summary: string;
  sourceUrl: string;
  sourceName: string; // e.g. "Heise", "New York Times", "YouTube - Lex Fridman"
  sourceType: 'Twitter/X' | 'Paper' | 'Video/YouTube' | 'Podcast' | 'News' | 'LinkedIn' | 'Andere';
  expertName: string;
  date: string;
  tags: string[]; // New field for categorization
  linkStatus?: LinkStatus; // Indicates if link is likely behind paywall or verified
}

export interface Report {
  id: string;
  createdAt: string;
  title: string;
  intro: string;
  items: ReportItem[];
  actionSteps: string[];
  rawMarkdown: string; 
}

export interface Highlight {
  id: string;
  text: string;
  expertName: string;
  sourceUrl: string;
  sourceName: string;
  sourceDate: string;
  highlightDate: string;
}

export interface FastScanResult {
  id: string;
  createdAt: string;
  content: string;
  sources: { title: string; uri: string }[];
}

export interface AppState {
  experts: Expert[];
  reports: Report[];
  highlights: Highlight[];
  fastScans: FastScanResult[];
  isGenerating: boolean;
  generatingType?: 'quick' | 'deep';
  progressMessage: string;
}