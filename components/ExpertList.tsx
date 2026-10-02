import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Expert, Report, Highlight } from '../types';
import { Trash2, Plus, CheckCircle, Circle, RefreshCw, Sparkles, Search, Users, AlertTriangle } from 'lucide-react';
import { analyzeExpertsBatch } from '../services/geminiService';
import { refreshFromWikipedia, matchesExpert, cleanName } from '../services/wikiService';
import { ExpertAvatar } from './ExpertAvatar';
import { ExpertProfile } from './ExpertProfile';

interface ExpertListProps {
  experts: Expert[];
  setExperts: React.Dispatch<React.SetStateAction<Expert[]>>;
  reports: Report[];
  highlights: Highlight[];
  onReset: () => void;
}

type Filter = 'all' | 'active' | 'paused';

// Gemini bekommt die Experten in Paketen, damit die Antworten präzise bleiben
const ASSESSMENT_BATCH_SIZE = 10;

export const ExpertList: React.FC<ExpertListProps> = ({ experts, setExperts, reports, highlights, onReset }) => {
  const [newExpertName, setNewExpertName] = useState('');
  const [newExpertRole, setNewExpertRole] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const autoLoaded = useRef(false);

  const updateExpert = (updated: Expert) =>
    setExperts(prev => prev.map(e => (e.id === updated.id ? updated : e)));

  const runWikiRefresh = async (list: Expert[], silent = false) => {
    if (list.length === 0) return;
    if (!silent) setBusy(`Lade Fotos & Biografien (${list.length})…`);
    const { found, missing, failed, error } = await refreshFromWikipedia(list, (id, patch) =>
      setExperts(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)))
    );
    setBusy(null);
    if (failed.length) {
      setNotice({
        error: true,
        text: `Wikipedia war für ${failed.length} von ${list.length} Profilen nicht erreichbar (${error}). ` +
          'Bitte Internetverbindung prüfen; Werbe- oder Tracking-Blocker können Wikipedia-Abfragen ebenfalls blockieren.'
      });
    } else if (!silent) {
      setNotice({
        text: `${found} von ${list.length} Profilen aus Wikipedia geladen.` +
          (missing.length ? ` Ohne Artikel: ${missing.join(', ')} – über „Bearbeiten“ lässt sich ein Artikel oder Foto festlegen.` : '')
      });
    }
  };

  // Erfolgsmeldungen verschwinden von selbst, Fehler bleiben bis zur Bestätigung stehen
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Beim ersten Öffnen automatisch alle Profile ohne Wikipedia-Stand nachladen
  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    runWikiRefresh(experts.filter(e => !e.wikiFetchedAt), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAssessment = async (list: Expert[]) => {
    try {
      for (let i = 0; i < list.length; i += ASSESSMENT_BATCH_SIZE) {
        const batch = list.slice(i, i + ASSESSMENT_BATCH_SIZE);
        setBusy(`KI-Einschätzung ${i + 1}–${i + batch.length} von ${list.length}…`);
        const results = await analyzeExpertsBatch(batch);
        const now = new Date().toISOString();
        setExperts(prev => prev.map(expert => {
          if (!batch.some(b => b.id === expert.id)) return expert;
          const r = results.find(res => cleanName(res.name).toLowerCase() === cleanName(expert.name).toLowerCase())
            || results.find(res => matchesExpert(expert, res.name));
          if (!r) return expert;
          return {
            ...expert,
            role: r.role || expert.role,
            company: r.company || expert.company,
            description: r.description || expert.description,
            relevance: r.relevance || expert.relevance,
            topics: r.topics?.length ? r.topics : expert.topics,
            lastUpdated: now
          };
        }));
      }
      setNotice({ text: `KI-Einschätzung für ${list.length} ${list.length === 1 ? 'Profil' : 'Profile'} aktualisiert.` });
    } catch (error: any) {
      const message: string = error?.message || '';
      const quota = message.includes('429') || message.toLowerCase().includes('quota');
      const badKey = /api[_ ]?key|API_KEY_INVALID|401|403/i.test(message);
      setNotice({
        error: true,
        text: badKey
          ? 'Gemini lehnt den API-Key ab. Bitte in der Datei .env.local die Zeile GEMINI_API_KEY=… mit einem gültigen Key aus aistudio.google.com/apikey prüfen und den Dev-Server neu starten.'
          : quota
            ? 'Das Limit für KI-Anfragen ist erreicht. Bitte später erneut versuchen.'
            : `Fehler bei der KI-Einschätzung: ${message || 'unbekannt'}`
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = (id: string) =>
    setExperts(prev => prev.map(exp => (exp.id === id ? { ...exp, active: !exp.active } : exp)));

  const removeExpert = (expert: Expert) => {
    if (!confirm(`${expert.name} wirklich entfernen?`)) return;
    setExperts(prev => prev.filter(exp => exp.id !== expert.id));
    if (selectedId === expert.id) setSelectedId(null);
  };

  const addExpert = () => {
    if (!newExpertName.trim()) return;
    const newExpert: Expert = {
      id: crypto.randomUUID(),
      name: newExpertName.trim(),
      role: newExpertRole.trim() || 'Unbekannt',
      company: 'Unbekannt',
      topics: [],
      active: true
    };
    setExperts(prev => [newExpert, ...prev]);
    setNewExpertName('');
    setNewExpertRole('');
    runWikiRefresh([newExpert], true);
  };

  const mentionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    experts.forEach(expert => {
      counts[expert.id] = reports.reduce(
        (sum, r) => sum + r.items.filter(item => item.expertName && matchesExpert(expert, item.expertName)).length,
        0
      );
    });
    return counts;
  }, [experts, reports]);

  const filteredExperts = experts.filter(expert => {
    if (filter === 'active' && !expert.active) return false;
    if (filter === 'paused' && expert.active) return false;
    const q = searchQuery.toLowerCase();
    return !q || [expert.name, expert.role, expert.company, ...expert.topics]
      .some(v => v?.toLowerCase().includes(q));
  });

  const selectedExpert = experts.find(e => e.id === selectedId);

  // Als fixierte Meldung unten rechts, damit sie auch bei gescrollter Profilseite sichtbar ist
  const statusBar = (busy || notice) && (
    <div
      role="status"
      className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-[150] flex items-start gap-3 border-2 px-4 py-3 text-sm shadow-xl bg-white ${notice?.error && !busy ? 'border-red-600 text-red-700' : 'border-zinc-900 text-zinc-700'}`}
    >
      {busy ? <RefreshCw className="w-4 h-4 animate-spin mt-0.5 shrink-0" /> : notice?.error ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />}
      <span className="flex-1">{busy || notice?.text}</span>
      {!busy && <button onClick={() => setNotice(null)} className="text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-900">OK</button>}
    </div>
  );

  if (selectedExpert) {
    return (
      <div>
        {statusBar}
        <ExpertProfile
          expert={selectedExpert}
          reports={reports}
          highlights={highlights}
          isRefreshing={!!busy}
          onBack={() => setSelectedId(null)}
          onRefreshWiki={e => runWikiRefresh([e])}
          onRefreshAssessment={e => runAssessment([e])}
          onToggleActive={toggleActive}
          onSave={(updated, wikiChanged) => {
            updateExpert(updated);
            if (wikiChanged) runWikiRefresh([updated]);
          }}
        />
      </div>
    );
  }

  const filterButton = (value: Filter, label: string) => (
    <button
      onClick={() => setFilter(value)}
      className={`text-[10px] font-bold uppercase tracking-widest px-3 py-2 border transition-colors ${filter === value ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-900'}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* Kopfzeile */}
      <div className="border-b-2 border-zinc-900 pb-6 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-2">Wer wird beobachtet</div>
          <h2 className="text-5xl md:text-6xl editorial-headline font-black text-zinc-900 tracking-tight flex items-center gap-4">
            <Users className="w-10 h-10" /> Köpfe der KI
          </h2>
          <p className="editorial-text text-zinc-600 mt-3 text-lg italic">
            {experts.filter(e => e.active).length} von {experts.length} Personen werden im Deep Research verfolgt.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 shrink-0">
          <button
            onClick={() => runWikiRefresh(experts)}
            disabled={!!busy}
            className="flex items-center justify-center gap-2 border-2 border-zinc-900 px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-50 disabled:opacity-50"
            title="Fotos & Biografien aus Wikipedia – dauert nur wenige Sekunden"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Fotos & Bios laden
          </button>
          <button
            onClick={() => confirm(`KI-Einschätzung für ${experts.length} Experten aktualisieren? (${Math.ceil(experts.length / ASSESSMENT_BATCH_SIZE)} Gemini-Anfragen)`) && runAssessment(experts)}
            disabled={!!busy}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-800 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" /> KI-Einschätzung
          </button>
        </div>
      </div>

      {statusBar}

      {/* Werkzeugleiste */}
      <div className="flex flex-col lg:flex-row gap-4 mb-10">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Name, Institution oder Thema…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {filterButton('all', 'Alle')}
          {filterButton('active', 'Aktiv')}
          {filterButton('paused', 'Pausiert')}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Neue Person"
            className="flex-1 min-w-0 lg:flex-none lg:w-40 px-3 py-2.5 bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900"
            value={newExpertName}
            onChange={e => setNewExpertName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExpert()}
          />
          <input
            type="text"
            placeholder="Rolle (optional)"
            className="flex-1 min-w-0 lg:flex-none lg:w-36 px-3 py-2.5 bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900"
            value={newExpertRole}
            onChange={e => setNewExpertRole(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExpert()}
          />
          <button onClick={addExpert} className="bg-zinc-900 hover:bg-zinc-800 text-white px-3" title="Hinzufügen">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Raster */}
      {filteredExperts.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 italic editorial-text">Keine Experten gefunden.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
          {filteredExperts.map(expert => (
            <article
              key={expert.id}
              onClick={() => setSelectedId(expert.id)}
              className={`group cursor-pointer transition-opacity ${expert.active ? '' : 'opacity-50 hover:opacity-100'}`}
            >
              <div className="relative overflow-hidden border border-zinc-200 group-hover:border-zinc-900 transition-colors">
                <ExpertAvatar
                  expert={expert}
                  className="w-full aspect-[4/5] object-cover bg-zinc-100 grayscale group-hover:grayscale-0 group-hover:scale-[1.03] transition-all duration-500"
                />
                {mentionCounts[expert.id] > 0 && (
                  <span className="absolute top-2 left-2 bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1">
                    {mentionCounts[expert.id]}× erwähnt
                  </span>
                )}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); toggleActive(expert.id); }}
                    className="bg-white/90 p-1.5 hover:bg-white"
                    title={expert.active ? 'Pausieren' : 'Aktivieren'}
                  >
                    {expert.active ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); removeExpert(expert); }}
                    className="bg-white/90 p-1.5 hover:bg-white hover:text-red-600"
                    title="Entfernen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="editorial-headline text-xl font-bold text-zinc-900 mt-3 leading-tight group-hover:underline underline-offset-4 decoration-2">
                {expert.name}
              </h3>
              <p className="editorial-text italic text-sm text-zinc-600 mt-1 line-clamp-2">
                {[expert.role, expert.company && expert.company !== 'Unbekannt' ? expert.company : null].filter(Boolean).join(' · ')}
              </p>
              {expert.topics.length > 0 && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-2 line-clamp-1">
                  {expert.topics.slice(0, 3).join(' · ')}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <div className="mt-16 pt-6 border-t border-zinc-200 text-right">
        <button onClick={onReset} className="text-xs text-zinc-400 hover:text-red-600 underline">
          Liste auf Standard (21) zurücksetzen
        </button>
      </div>
    </div>
  );
};
