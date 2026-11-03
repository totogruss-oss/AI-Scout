/**
 * Automatisches Speichern in eine selbst gewählte Datei (File System Access API).
 * Verfügbar in Chromium-Browsern (Chrome, Edge, Dia, Arc), nicht in Safari/Firefox.
 * Liegt die Datei in einem synchronisierten Ordner (OneDrive, Google Drive, iCloud),
 * übernimmt der Desktop-Client den Abgleich zwischen Geräten.
 */
import { BACKUP_FILE_NAME } from './backupService';

const DB_NAME = 'ai-scout';
const STORE = 'handles';
const HANDLE_KEY = 'sync-file';

export const isFileSyncSupported = (): boolean =>
  typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

const pickerTypes = [{ description: 'AI-Scout-Daten', accept: { 'application/json': ['.json'] } }];

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idb = async <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
};

export const getStoredHandle = async (): Promise<FileSystemFileHandle | null> => {
  try {
    return (await idb<FileSystemFileHandle | undefined>('readonly', s => s.get(HANDLE_KEY))) || null;
  } catch {
    return null;
  }
};

const storeHandle = (h: FileSystemFileHandle) => idb('readwrite', s => s.put(h, HANDLE_KEY));

export const forgetHandle = async () => {
  try {
    await idb('readwrite', s => s.delete(HANDLE_KEY));
  } catch {
    /* ignorieren */
  }
};

/** Prüft (und erbittet auf Wunsch) Lese-/Schreibrechte für die Datei. */
export const ensurePermission = async (h: FileSystemFileHandle, request: boolean): Promise<boolean> => {
  const anyH = h as any;
  const opts = { mode: 'readwrite' };
  if ((await anyH.queryPermission?.(opts)) === 'granted') return true;
  if (!request) return false;
  return (await anyH.requestPermission?.(opts)) === 'granted';
};

/** Neue Sicherungsdatei anlegen (Nutzer wählt Ordner, z. B. im OneDrive-Ordner). */
export const createSyncFile = async (): Promise<FileSystemFileHandle> => {
  const h: FileSystemFileHandle = await (window as any).showSaveFilePicker({
    suggestedName: BACKUP_FILE_NAME,
    types: pickerTypes,
  });
  await storeHandle(h);
  return h;
};

/** Vorhandene Sicherungsdatei auswählen (z. B. auf dem zweiten Gerät). */
export const openSyncFile = async (): Promise<FileSystemFileHandle> => {
  const [h]: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
    types: pickerTypes,
    multiple: false,
  });
  if (!(await ensurePermission(h, true))) {
    throw new Error('Ohne Schreibrecht kann die App nicht in die Datei speichern.');
  }
  await storeHandle(h);
  return h;
};

export const readSyncFile = async (h: FileSystemFileHandle): Promise<string> => (await h.getFile()).text();

export const writeSyncFile = async (h: FileSystemFileHandle, text: string) => {
  const w = await (h as any).createWritable();
  await w.write(text);
  await w.close();
};

/** Wurde der Dateidialog abgebrochen? Dann keine Fehlermeldung zeigen. */
export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
