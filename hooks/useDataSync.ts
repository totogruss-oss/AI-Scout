import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackupData,
  BackupFile,
  downloadBackup,
  formatDateTime,
  getLocalChangedAt,
  hasUserContent,
  parseBackup,
  serializeBackup,
  setLocalChangedAt,
} from '../services/backupService';
import {
  createSyncFile,
  ensurePermission,
  forgetHandle,
  getStoredHandle,
  isAbort,
  isFileSyncSupported,
  openSyncFile,
  readSyncFile,
  writeSyncFile,
} from '../services/fileSync';
import {
  DriveAuthError,
  createDataFile,
  downloadDataFile,
  findDataFile,
  getDriveLink,
  hasValidToken,
  isDriveConfigured,
  preloadDrive,
  setDriveLink,
  signIn,
  signOut,
  updateDataFile,
} from '../services/driveSync';

export type SyncState = 'off' | 'saving' | 'saved' | 'needs-action' | 'error';

export interface TargetStatus {
  state: SyncState;
  message?: string;
  lastSavedAt?: string;
  /** z. B. Dateiname */
  label?: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Unbekannter Fehler.');

/**
 * Hält die Daten der App mit den gewählten Speicherzielen (Datei, Google Drive) synchron.
 * Regel bei unterschiedlichen Ständen: Der neuere gewinnt; ist der entfernte Stand neuer,
 * wird vor dem Ersetzen der Browser-Daten nachgefragt.
 */
export function useDataSync(data: BackupData, applyData: (d: BackupData) => void) {
  const [fileStatus, setFileStatus] = useState<TargetStatus>({ state: 'off' });
  const [driveStatus, setDriveStatus] = useState<TargetStatus>({ state: 'off' });

  const dataRef = useRef(data);
  dataRef.current = data;
  const fileHandle = useRef<FileSystemFileHandle | null>(null);
  const skipNextChange = useRef(true); // erster Render ist keine Änderung
  const pushAfterLoad = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** Schreibvorgänge nacheinander ausführen, nie parallel. */
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(job, job);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  /**
   * Übernimmt einen Stand. Bei manuellem Import zählt er als neue Änderung (asNewChange),
   * damit er beim nächsten Abgleich nicht von einem anderen Gerät überschrieben wird.
   */
  const load = useCallback((backup: BackupFile, asNewChange = false) => {
    skipNextChange.current = true;
    pushAfterLoad.current = true;
    setLocalChangedAt(asNewChange ? new Date().toISOString() : backup.savedAt);
    applyData(backup.data);
  }, [applyData]);

  /**
   * Vergleicht einen entfernten Stand mit dem lokalen.
   * 'loaded' = entfernter Stand übernommen bzw. identisch, 'keep-local' = lokaler Stand soll geschrieben werden.
   */
  const reconcile = useCallback((remoteText: string | null, source: string): 'loaded' | 'same' | 'keep-local' => {
    if (!remoteText) return 'keep-local';
    const remote = parseBackup(remoteText); // wirft bei ungültiger Datei -> nichts wird überschrieben
    const localAt = getLocalChangedAt();
    if (remote.savedAt === localAt) return 'same';
    const localHasContent = hasUserContent(dataRef.current);
    if (!localHasContent && hasUserContent(remote.data)) {
      load(remote);
      return 'loaded';
    }
    if (remote.savedAt > localAt) {
      const ok = window.confirm(
        `In ${source} liegt ein neuerer Stand vom ${formatDateTime(remote.savedAt)}.\n\n` +
        `OK: Diesen Stand laden. Die Daten in diesem Browser (Stand ${formatDateTime(localAt)}) werden ersetzt.\n` +
        `Abbrechen: Die Daten dieses Browsers behalten und damit ${source} überschreiben.`
      );
      if (ok) {
        load(remote);
        return 'loaded';
      }
    }
    return 'keep-local';
  }, [load]);

  // --- Schreiben -------------------------------------------------------------

  const writeFile = useCallback(async (text: string) => {
    const h = fileHandle.current;
    if (!h) return;
    if (!(await ensurePermission(h, false))) {
      setFileStatus(s => ({ ...s, state: 'needs-action', message: 'Ungespeicherte Änderungen: Zugriff auf die Datei bestätigen.' }));
      return;
    }
    setFileStatus(s => ({ ...s, state: 'saving', message: undefined }));
    try {
      await writeSyncFile(h, text);
      setFileStatus({ state: 'saved', label: h.name, lastSavedAt: new Date().toISOString() });
    } catch (e) {
      setFileStatus(s => ({ ...s, state: 'error', message: errorText(e) }));
    }
  }, []);

  const writeDrive = useCallback(async (text: string, savedAt: string) => {
    const link = getDriveLink();
    if (!link) return;
    if (!hasValidToken()) {
      setDriveStatus(s => ({ ...s, state: 'needs-action', message: 'Ungespeicherte Änderungen: bitte neu mit Google verbinden.' }));
      return;
    }
    setDriveStatus(s => ({ ...s, state: 'saving', message: undefined }));
    try {
      const fileId = link.fileId ? await updateDataFile(link.fileId, text) : await createDataFile(text);
      setDriveLink({ fileId, lastSyncedAt: savedAt });
      setDriveStatus({ state: 'saved', lastSavedAt: new Date().toISOString() });
    } catch (e) {
      setDriveStatus(s => ({
        ...s,
        state: e instanceof DriveAuthError ? 'needs-action' : 'error',
        message: e instanceof DriveAuthError ? 'Ungespeicherte Änderungen: bitte neu mit Google verbinden.' : errorText(e),
      }));
    }
  }, []);

  const saveAll = useCallback(() => enqueue(async () => {
    const savedAt = getLocalChangedAt();
    const text = serializeBackup(dataRef.current, savedAt);
    await Promise.all([writeFile(text), writeDrive(text, savedAt)]);
  }), [enqueue, writeFile, writeDrive]);

  // Jede inhaltliche Änderung: Zeitstempel setzen und kurz danach speichern
  useEffect(() => {
    if (skipNextChange.current) {
      skipNextChange.current = false;
      if (pushAfterLoad.current) {
        pushAfterLoad.current = false;
        saveAll();
      }
      return;
    }
    setLocalChangedAt(new Date().toISOString());
    const t = setTimeout(saveAll, 1500);
    return () => clearTimeout(t);
  }, [data, saveAll]);

  // --- Start: gespeicherte Verbindungen wiederherstellen ----------------------

  useEffect(() => {
    (async () => {
      if (isFileSyncSupported()) {
        const h = await getStoredHandle();
        if (h) {
          fileHandle.current = h;
          if (await ensurePermission(h, false)) {
            try {
              const r = reconcile(await readSyncFile(h), 'der Sicherungsdatei');
              if (r === 'keep-local') saveAll();
              setFileStatus({ state: 'saved', label: h.name });
            } catch (e) {
              setFileStatus({ state: 'error', label: h.name, message: errorText(e) });
            }
          } else {
            setFileStatus({ state: 'needs-action', label: h.name, message: 'Zugriff auf die Datei bestätigen, um weiter automatisch zu speichern.' });
          }
        }
      }
      if (isDriveConfigured() && getDriveLink()) {
        preloadDrive();
        setDriveStatus({ state: 'needs-action', message: 'Mit Google verbinden, um den neuesten Stand abzugleichen.' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Aktionen für den Dialog -----------------------------------------------

  const exportBackup = useCallback(() => downloadBackup(dataRef.current, getLocalChangedAt()), []);

  const importBackup = useCallback(async (file: File) => {
    const backup = parseBackup(await file.text());
    const ok = !hasUserContent(dataRef.current) || window.confirm(
      `Sicherung vom ${formatDateTime(backup.savedAt)} einspielen?\n\nDie aktuellen Daten in diesem Browser werden dabei ersetzt.`
    );
    if (ok) load(backup, true);
    return ok;
  }, [load]);

  const fileCreate = useCallback(async () => {
    try {
      const h = await createSyncFile();
      fileHandle.current = h;
      setFileStatus({ state: 'saving', label: h.name });
      await saveAll();
    } catch (e) {
      if (!isAbort(e)) setFileStatus(s => ({ ...s, state: 'error', message: errorText(e) }));
    }
  }, [saveAll]);

  const fileOpen = useCallback(async () => {
    try {
      const h = await openSyncFile();
      fileHandle.current = h;
      setFileStatus({ state: 'saving', label: h.name });
      const r = reconcile(await readSyncFile(h), 'der Datei');
      if (r === 'keep-local') await saveAll();
      else setFileStatus({ state: 'saved', label: h.name, lastSavedAt: new Date().toISOString() });
    } catch (e) {
      if (!isAbort(e)) setFileStatus(s => ({ ...s, state: 'error', message: errorText(e) }));
    }
  }, [reconcile, saveAll]);

  const fileReconnect = useCallback(async () => {
    const h = fileHandle.current;
    if (!h) return;
    if (!(await ensurePermission(h, true))) {
      setFileStatus(s => ({ ...s, state: 'needs-action', message: 'Zugriff wurde nicht erlaubt.' }));
      return;
    }
    try {
      const r = reconcile(await readSyncFile(h), 'der Sicherungsdatei');
      if (r === 'keep-local') await saveAll();
      else setFileStatus({ state: 'saved', label: h.name, lastSavedAt: new Date().toISOString() });
    } catch (e) {
      setFileStatus(s => ({ ...s, state: 'error', message: errorText(e) }));
    }
  }, [reconcile, saveAll]);

  const fileDisconnect = useCallback(async () => {
    await forgetHandle();
    fileHandle.current = null;
    setFileStatus({ state: 'off' });
  }, []);

  /** Verbinden bzw. abgleichen: holt den Stand aus Drive, vergleicht, schreibt bei Bedarf zurück. */
  const driveSync = useCallback(async (interactive: boolean) => {
    try {
      if (!hasValidToken()) {
        if (!interactive) return;
        await signIn();
      }
      setDriveStatus(s => ({ ...s, state: 'saving', message: 'Gleiche mit Google Drive ab …' }));
      let fileId = getDriveLink()?.fileId || (await findDataFile()) || undefined;
      const text = fileId ? await downloadDataFile(fileId) : null;
      if (fileId && text === null) fileId = undefined; // Datei wurde im Drive gelöscht
      setDriveLink({ ...getDriveLink(), fileId });
      const r = reconcile(text, 'Google Drive');
      if (r === 'keep-local') {
        await saveAll();
      } else {
        setDriveLink({ fileId, lastSyncedAt: getLocalChangedAt() });
        setDriveStatus({ state: 'saved', lastSavedAt: new Date().toISOString() });
      }
    } catch (e) {
      setDriveStatus(s => ({
        ...s,
        state: getDriveLink() ? (e instanceof DriveAuthError ? 'needs-action' : 'error') : 'off',
        message: errorText(e),
      }));
    }
  }, [reconcile, saveAll]);

  const driveDisconnect = useCallback(() => {
    signOut();
    setDriveLink(null);
    setDriveStatus({ state: 'off' });
  }, []);

  // Beim Zurückkehren in den Tab neuesten Drive-Stand holen (z. B. nach Arbeit am anderen Gerät)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && getDriveLink() && hasValidToken()) driveSync(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [driveSync]);

  const overall: SyncState = [fileStatus.state, driveStatus.state].some(s => s === 'needs-action' || s === 'error')
    ? 'needs-action'
    : [fileStatus.state, driveStatus.state].some(s => s === 'saved' || s === 'saving')
      ? 'saved'
      : 'off';

  return {
    overall,
    fileStatus,
    driveStatus,
    fileSupported: isFileSyncSupported(),
    driveAvailable: isDriveConfigured(),
    exportBackup,
    importBackup,
    fileCreate,
    fileOpen,
    fileReconnect,
    fileDisconnect,
    driveConnect: () => driveSync(true),
    driveDisconnect,
  };
}

export type DataSync = ReturnType<typeof useDataSync>;
