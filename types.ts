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
  imageSource?: 'wikipedia' | 'manual' | 'social';
  // Wikipedia-Verknüpfung: "de:Titel" / "en:Titel" erzwingt einen Artikel, "-" schaltet die Suche ab
  wikiTitle?: string;
  wikiUrl?: string;
  wikiExtract?: string;
  wikiFetchedAt?: string;
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