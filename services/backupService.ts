import { AppState } from '../types';

/**
 * Sicherungsformat von AI Scout. Enthält nur die Nutzdaten (Experten, Reports,
 * Markierungen, Quick Scans), nie den API-Key.
 */
export type BackupData = Pick<AppState, 'experts' | 'curationVersion' | 'reports' | 'highlights' | 'fastScans'>;

export interface BackupFile {
  format: 'ai-scout-backup';
  version: 1;
  /** Zeitpunkt der letzten inhaltlichen Änderung (ISO). Grundlage für "welcher Stand ist neuer?" */
  savedAt: string;
  data: BackupData;
}

export const BACKUP_FILE_NAME = 'ai-scout-daten.json';
const CHANGED_AT_KEY = 'ai_scout_changed_at';

export const pickBackupData = (state: AppState): BackupData => ({
  experts: state.experts,
  curationVersion: state.curationVersion,
  reports: state.reports,
  highlights: state.highlights,
  fastScans: state.fastScans,
});

export const serializeBackup = (data: BackupData, savedAt: string): string =>
  JSON.stringify({ format: 'ai-scout-backup', version: 1, savedAt, data } satisfies BackupFile);

export class InvalidBackupError extends Error {
  constructor(message = 'Die Datei ist keine gültige AI-Scout-Sicherung.') {
    super(message);
    this.name = 'InvalidBackupError';
  }
}

export const parseBackup = (text: string): BackupFile => {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidBackupError();
  }
  const d = parsed?.data;
  if (
    parsed?.format !== 'ai-scout-backup' ||
    !d ||
    !Array.isArray(d.experts) ||
    !Array.isArray(d.reports) ||
    !Array.isArray(d.highlights) ||
    !Array.isArray(d.fastScans)
  ) {
    throw new InvalidBackupError();
  }
  if (parsed.version > 1) {
    throw new InvalidBackupError('Diese Sicherung stammt aus einer neueren Version von AI Scout. Bitte die App neu laden.');
  }
  return {
    format: 'ai-scout-backup',
    version: 1,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
    data: d,
  };
};

/** Hat dieser Browser schon eigene Inhalte (Recherchen, Markierungen)? */
export const hasUserContent = (data: BackupData) =>
  data.reports.length > 0 || data.fastScans.length > 0 || data.highlights.length > 0;

export const getLocalChangedAt = (): string => {
  try {
    return localStorage.getItem(CHANGED_AT_KEY) || new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
};

export const setLocalChangedAt = (iso: string) => {
  try {
    localStorage.setItem(CHANGED_AT_KEY, iso);
  } catch {
    /* ignorieren */
  }
};

/** Lädt die Sicherung als Datei herunter (funktioniert in jedem Browser). */
export const downloadBackup = (data: BackupData, savedAt: string) => {
  const blob = new Blob([serializeBackup(data, savedAt)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-scout-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const formatDateTime = (iso?: string | null) => {
  if (!iso || iso.startsWith('1970')) return '–';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
