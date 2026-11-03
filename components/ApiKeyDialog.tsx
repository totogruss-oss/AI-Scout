import React, { useEffect, useState } from 'react';
import { KeyRound, X, ExternalLink, ShieldCheck, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  getApiKey,
  getKeyPersistence,
  setApiKey,
  clearApiKey,
  maskApiKey,
  KeyPersistence,
} from '../services/apiKeyStore';

interface ApiKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Wird angezeigt, wenn der Dialog automatisch durch eine Funktion ohne Key geöffnet wurde. */
  reason?: string;
}

export const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ isOpen, onClose, reason }) => {
  const [input, setInput] = useState('');
  const [persistence, setPersistence] = useState<KeyPersistence>('session');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  const storedKey = getApiKey();
  const storedPersistence = getKeyPersistence();

  useEffect(() => {
    if (isOpen) {
      setInput('');
      setError('');
      setShowKey(false);
      setPersistence(getKeyPersistence() === 'device' ? 'device' : 'session');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const key = input.trim();
    if (key.length < 20 || /\s/.test(key)) {
      setError('Das sieht nicht nach einem gültigen API-Key aus. Bitte den Key vollständig und ohne Leerzeichen einfügen.');
      return;
    }
    setApiKey(key, persistence);
    onClose();
  };

  const handleClear = () => {
    clearApiKey();
    setInput('');
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-title"
    >
      <div
        className="bg-white text-zinc-900 border-2 border-zinc-900 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-zinc-900 px-6 py-4">
          <h2 id="api-key-title" className="flex items-center gap-3 text-xl font-black uppercase tracking-tight">
            <KeyRound className="w-5 h-5" />
            Gemini-API-Key
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900" aria-label="Schließen">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {reason && (
            <p className="bg-zinc-100 border-l-4 border-zinc-900 px-4 py-3 text-sm font-medium">{reason}</p>
          )}

          <p className="text-sm text-zinc-700 leading-relaxed">
            AI Scout nutzt Googles Gemini. Damit die App für alle frei nutzbar bleibt, hinterlegst du deinen
            <strong> eigenen</strong> Key. Anfragen gehen direkt von deinem Browser an Google, ohne Umweg über einen
            fremden Server. Eventuelle Kosten laufen über dein Google-Konto.
          </p>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest underline underline-offset-4 hover:text-zinc-600"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Kostenlosen Key bei Google AI Studio erstellen
          </a>

          {storedKey && (
            <div className="flex items-center justify-between gap-4 border-2 border-zinc-200 px-4 py-3">
              <div className="text-sm">
                <div className="font-mono">{maskApiKey(storedKey)}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-1">
                  {storedPersistence === 'device'
                    ? 'Auf diesem Gerät gespeichert'
                    : 'Nur für diese Sitzung, wird beim Schließen des Tabs gelöscht'}
                </div>
              </div>
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-700 hover:text-red-900 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                Löschen
              </button>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-widest">
                {storedKey ? 'Neuen Key einfügen' : 'Key einfügen'}
              </span>
              <div className="mt-2 flex border-2 border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-400">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={input}
                  onChange={e => { setInput(e.target.value); setError(''); }}
                  placeholder="AIza…"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 px-3 py-2.5 font-mono text-sm outline-none bg-white"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="px-3 text-zinc-500 hover:text-zinc-900"
                  aria-label={showKey ? 'Key verbergen' : 'Key anzeigen'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            </label>

            <fieldset className="space-y-3">
              <legend className="text-xs font-bold uppercase tracking-widest mb-2">Speicherung</legend>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="persistence"
                  checked={persistence === 'session'}
                  onChange={() => setPersistence('session')}
                  className="mt-1 accent-zinc-900"
                />
                <span className="text-sm">
                  <strong>Nur für diese Sitzung</strong> (empfohlen)
                  <span className="block text-zinc-600">Der Key wird beim Schließen des Tabs automatisch gelöscht.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="persistence"
                  checked={persistence === 'device'}
                  onChange={() => setPersistence('device')}
                  className="mt-1 accent-zinc-900"
                />
                <span className="text-sm">
                  <strong>Auf diesem Gerät merken</strong>
                  <span className="block text-zinc-600">
                    Bequemer, aber der Key bleibt im Browser gespeichert. Nur auf eigenen, privaten Geräten nutzen,
                    nicht auf geteilten oder schulischen Rechnern.
                  </span>
                </span>
              </label>
            </fieldset>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border-2 border-zinc-900 font-bold text-xs uppercase tracking-widest hover:bg-zinc-100"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-5 py-2.5 bg-zinc-900 text-white font-bold text-xs uppercase tracking-widest hover:bg-zinc-800 disabled:opacity-40"
              >
                Key speichern
              </button>
            </div>
          </form>

          <div className="flex gap-3 border-t border-zinc-200 pt-5 text-xs text-zinc-600 leading-relaxed">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-zinc-900" />
            <p>
              Der Key wird nur in deinem Browser gespeichert und ausschließlich an Google gesendet. Tipp: Setze in
              Google AI Studio ein Ausgabenlimit, dann behältst du die Kosten im Griff.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
