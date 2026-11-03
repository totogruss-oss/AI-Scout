import React, { useEffect, useRef, useState } from 'react';
import {
  X, DatabaseBackup, Download, Upload, FileJson, Link2, Unlink, RefreshCw, CheckCircle2, AlertTriangle, Loader2, Cloud,
} from 'lucide-react';
import { DataSync, TargetStatus } from '../hooks/useDataSync';
import { formatDateTime } from '../services/backupService';

interface DataSyncDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sync: DataSync;
}

const StatusLine: React.FC<{ status: TargetStatus; connectedText: string }> = ({ status, connectedText }) => {
  if (status.state === 'off' && !status.message) return null;
  const icon = {
    saving: <Loader2 className="w-4 h-4 animate-spin" />,
    saved: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
    'needs-action': <AlertTriangle className="w-4 h-4 text-amber-600" />,
    error: <AlertTriangle className="w-4 h-4 text-red-700" />,
    off: <AlertTriangle className="w-4 h-4 text-zinc-500" />,
  }[status.state];
  return (
    <div className="flex items-start gap-2 text-sm bg-zinc-50 border border-zinc-200 px-3 py-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        {status.state === 'saved' && (
          <>
            {connectedText}
            {status.label && <span className="font-mono"> {status.label}</span>}
            {status.lastSavedAt && <span className="text-zinc-500"> · zuletzt gespeichert {formatDateTime(status.lastSavedAt)}</span>}
          </>
        )}
        {status.state === 'saving' && (status.message || 'Speichere …')}
        {(status.state === 'needs-action' || status.state === 'error' || status.state === 'off') && status.message}
      </span>
    </div>
  );
};

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <section className="space-y-3 border-t border-zinc-200 pt-5 first:border-t-0 first:pt-0">
    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
      {icon}
      {title}
    </h3>
    {children}
  </section>
);

const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2 border-2 border-zinc-900 font-bold text-xs uppercase tracking-widest hover:bg-zinc-100 disabled:opacity-40';
const btnPrimary = 'inline-flex items-center justify-center gap-2 px-4 py-2 border-2 border-zinc-900 bg-zinc-900 text-white font-bold text-xs uppercase tracking-widest hover:bg-zinc-800 disabled:opacity-40';
const btnQuiet = 'inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-red-700';

export const DataSyncDialog: React.FC<DataSyncDialogProps> = ({ isOpen, onClose, sync }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setImportMsg(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const done = await sync.importBackup(file);
      if (done) setImportMsg({ ok: true, text: 'Sicherung eingespielt.' });
    } catch (err) {
      setImportMsg({ ok: false, text: err instanceof Error ? err.message : 'Import fehlgeschlagen.' });
    }
  };

  const { fileStatus: fs, driveStatus: ds } = sync;
  const driveBusy = ds.state === 'saving';

  return (
    <div
      className="fixed inset-0 z-[200] bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-title"
    >
      <div
        className="bg-white text-zinc-900 border-2 border-zinc-900 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-zinc-900 px-6 py-4">
          <h2 id="sync-title" className="flex items-center gap-3 text-xl font-black uppercase tracking-tight">
            <DatabaseBackup className="w-5 h-5" />
            Daten &amp; Sicherung
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900" aria-label="Schließen">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <p className="text-sm text-zinc-700 leading-relaxed">
            Deine Recherchen, Markierungen und Expertenliste liegen zunächst nur in diesem Browser. Damit sie nicht
            verloren gehen und auf anderen Geräten verfügbar sind, wähle einen Speicherort. Der API-Key wird dabei
            nie mitgespeichert.
          </p>

          {/* Google Drive */}
          {sync.driveAvailable && (
            <Section icon={<Cloud className="w-4 h-4" />} title="Google Drive (empfohlen)">
              <p className="text-sm text-zinc-600">
                Funktioniert auf allen Geräten. Die App legt in deinem Drive die Datei <span className="font-mono">ai-scout-daten.json</span> an
                und sieht nur diese, nicht deine übrigen Dokumente. Gespeichert wird automatisch nach jeder Änderung.
              </p>
              <StatusLine status={ds} connectedText="Verbunden mit Google Drive" />
              <div className="flex flex-wrap items-center gap-3">
                {ds.state === 'off' ? (
                  <button className={btnPrimary} onClick={sync.driveConnect}>
                    <Link2 className="w-4 h-4" /> Mit Google verbinden
                  </button>
                ) : (
                  <>
                    <button className={ds.state === 'needs-action' ? btnPrimary : btn} onClick={sync.driveConnect} disabled={driveBusy}>
                      <RefreshCw className={`w-4 h-4 ${driveBusy ? 'animate-spin' : ''}`} />
                      {ds.state === 'needs-action' ? 'Neu verbinden' : 'Jetzt abgleichen'}
                    </button>
                    <button className={btnQuiet} onClick={sync.driveDisconnect}>
                      <Unlink className="w-4 h-4" /> Trennen
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Aus Sicherheitsgründen gilt eine Google-Verbindung etwa eine Stunde. Danach genügt ein Klick auf „Neu verbinden“.
              </p>
            </Section>
          )}

          {/* Automatische Datei */}
          <Section icon={<FileJson className="w-4 h-4" />} title="Automatisch in Datei speichern">
            {sync.fileSupported ? (
              <>
                <p className="text-sm text-zinc-600">
                  Die App speichert nach jeder Änderung in eine Datei deiner Wahl. Tipp: Lege sie in deinen OneDrive-,
                  Google-Drive- oder iCloud-Ordner, dann gleicht der Sync-Client sie mit deinen anderen Rechnern ab.
                </p>
                <StatusLine status={fs} connectedText="Speichert in" />
                <div className="flex flex-wrap items-center gap-3">
                  {fs.state === 'off' && !fs.label ? (
                    <>
                      <button className={btn} onClick={sync.fileCreate}>
                        <FileJson className="w-4 h-4" /> Neue Datei anlegen
                      </button>
                      <button className={btn} onClick={sync.fileOpen}>
                        <Link2 className="w-4 h-4" /> Vorhandene Datei verbinden
                      </button>
                    </>
                  ) : (
                    <>
                      {(fs.state === 'needs-action' || fs.state === 'error') && (
                        <button className={btnPrimary} onClick={sync.fileReconnect}>
                          <RefreshCw className="w-4 h-4" /> Zugriff bestätigen
                        </button>
                      )}
                      <button className={btnQuiet} onClick={sync.fileDisconnect}>
                        <Unlink className="w-4 h-4" /> Trennen
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-600">
                Nur in Chrome, Edge, Dia oder Arc am Computer verfügbar. Nutze hier{sync.driveAvailable ? ' Google Drive oder' : ''} die
                manuelle Sicherung unten.
              </p>
            )}
          </Section>

          {/* Manuell */}
          <Section icon={<DatabaseBackup className="w-4 h-4" />} title="Manuelle Sicherung">
            <p className="text-sm text-zinc-600">
              Funktioniert überall: Sicherung als Datei herunterladen und bei Bedarf auf einem anderen Gerät wieder einspielen.
            </p>
            <div className="flex flex-wrap gap-3">
              <button className={btn} onClick={sync.exportBackup}>
                <Download className="w-4 h-4" /> Sicherung herunterladen
              </button>
              <button className={btn} onClick={() => inputRef.current?.click()}>
                <Upload className="w-4 h-4" /> Sicherung einspielen
              </button>
              <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
            </div>
            {importMsg && (
              <p className={`text-sm ${importMsg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{importMsg.text}</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
};
