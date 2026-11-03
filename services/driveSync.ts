/**
 * Synchronisierung mit dem Google Drive der nutzenden Person.
 *
 * - Anmeldung über Google Identity Services direkt im Browser, kein eigener Server.
 * - Berechtigung "drive.file": Die App sieht ausschließlich Dateien, die sie selbst
 *   angelegt hat, nicht die übrigen Dokumente im Drive.
 * - Die OAuth-Client-ID ist kein Geheimnis; sie wird beim Build über
 *   VITE_GOOGLE_CLIENT_ID gesetzt. Ohne sie ist die Funktion ausgeblendet.
 */
import { BACKUP_FILE_NAME } from './backupService';

const CLIENT_ID: string | undefined = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const STATE_KEY = 'ai_scout_drive';

export const isDriveConfigured = () => !!CLIENT_ID;

export interface DriveLink {
  fileId?: string;
  /** Stand (savedAt), der zuletzt mit Drive abgeglichen wurde */
  lastSyncedAt?: string;
}

export const getDriveLink = (): DriveLink | null => {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setDriveLink = (link: DriveLink | null) => {
  try {
    if (link) localStorage.setItem(STATE_KEY, JSON.stringify(link));
    else localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignorieren */
  }
};

// --- Anmeldung -------------------------------------------------------------

let token: { value: string; expiresAt: number } | null = null;
let gisPromise: Promise<void> | null = null;

const loadGis = () => {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Die Google-Anmeldung konnte nicht geladen werden. Blockiert ein Werbe- oder Tracking-Blocker accounts.google.com?'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
};

/** Lädt das Google-Skript schon vorab, damit der Anmelde-Popup direkt beim Klick aufgeht. */
export const preloadDrive = () => {
  if (CLIENT_ID) loadGis().catch(() => undefined);
};

export const hasValidToken = () => !!token && token.expiresAt - 60_000 > Date.now();

/** Muss aus einem Klick heraus aufgerufen werden (sonst blockiert der Browser das Popup). */
export const signIn = async (): Promise<void> => {
  if (!CLIENT_ID) throw new Error('Google Drive ist für diese Installation nicht eingerichtet.');
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(`Google-Anmeldung fehlgeschlagen (${resp.error}).`));
        token = { value: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in || 3600) * 1000 };
        resolve();
      },
      error_callback: (err: any) =>
        reject(new Error(err?.type === 'popup_closed' ? 'Anmeldung abgebrochen.' : 'Google-Anmeldung fehlgeschlagen. Sind Pop-ups erlaubt?')),
    });
    client.requestAccessToken({ prompt: '' });
  });
};

export const signOut = () => {
  if (token) {
    try {
      (window as any).google?.accounts?.oauth2?.revoke(token.value, () => undefined);
    } catch {
      /* ignorieren */
    }
  }
  token = null;
};

// --- Dateizugriff ----------------------------------------------------------

export class DriveAuthError extends Error {}

const call = async (url: string, init: RequestInit = {}) => {
  if (!hasValidToken()) throw new DriveAuthError('Google-Verbindung abgelaufen.');
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token!.value}` },
  });
  if (res.status === 401) {
    token = null;
    throw new DriveAuthError('Google-Verbindung abgelaufen.');
  }
  return res;
};

const ensureOk = async (res: Response, what: string) => {
  if (!res.ok) throw new Error(`Google Drive: ${what} fehlgeschlagen (HTTP ${res.status}).`);
  return res;
};

/** Sucht die Datendatei der App (die App sieht nur eigene Dateien). */
export const findDataFile = async (): Promise<string | null> => {
  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const res = await ensureOk(
    await call(`${API}?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id)&pageSize=1`),
    'Suche'
  );
  const json = await res.json();
  return json.files?.[0]?.id || null;
};

export const downloadDataFile = async (fileId: string): Promise<string | null> => {
  const res = await call(`${API}/${fileId}?alt=media`);
  if (res.status === 404) return null;
  await ensureOk(res, 'Laden');
  return res.text();
};

export const createDataFile = async (text: string): Promise<string> => {
  const boundary = 'ai-scout-' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: BACKUP_FILE_NAME, mimeType: 'application/json', description: 'Daten der App AI Scout' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  const res = await ensureOk(
    await call(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }),
    'Anlegen'
  );
  return (await res.json()).id;
};

/** Überschreibt die Datei; ist sie gelöscht worden, wird sie neu angelegt. Gibt die (ggf. neue) ID zurück. */
export const updateDataFile = async (fileId: string, text: string): Promise<string> => {
  const res = await call(`${UPLOAD}/${fileId}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  });
  if (res.status === 404) return createDataFile(text);
  await ensureOk(res, 'Speichern');
  return fileId;
};
