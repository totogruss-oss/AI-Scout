import React, { useMemo, useState } from 'react';
import { Expert, Report, Highlight, ReportItem } from '../types';
import { ArrowLeft, ExternalLink, RefreshCw, Sparkles, Pencil, Check, X, Bookmark, BookOpen, AtSign, CheckCircle, Circle } from 'lucide-react';
import { ExpertAvatar } from './ExpertAvatar';
import { matchesExpert, normalizeWikiInput } from '../services/wikiService';

interface ExpertProfileProps {
  expert: Expert;
  reports: Report[];
  highlights: Highlight[];
  isRefreshing: boolean;
  onBack: () => void;
  onRefreshWiki: (expert: Expert) => void;
  onRefreshAssessment: (expert: Expert) => void;
  onSave: (expert: Expert, wikiChanged: boolean) => void;
  onToggleActive: (id: string) => void;
}

interface Mention {
  item: ReportItem;
  reportTitle: string;
  date: Date;
}

const toDate = (value: string | undefined, fallback: string) => {
  const parsed = value ? new Date(value) : new Date(NaN);
  return isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-900 border-b-2 border-zinc-900 pb-2 mb-5">{children}</h3>
);

export const ExpertProfile: React.FC<ExpertProfileProps> = ({
  expert, reports, highlights, isRefreshing, onBack, onRefreshWiki, onRefreshAssessment, onSave, onToggleActive
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ imageUrl: '', wikiTitle: '', twitterHandle: '', topics: '' });
  const [enlarged, setEnlarged] = useState(false);

  const mentions = useMemo<Mention[]>(() => {
    const result: Mention[] = [];
    reports.forEach(report => {
      report.items.forEach(item => {
        if (item.expertName && matchesExpert(expert, item.expertName)) {
          result.push({ item, reportTitle: report.title, date: toDate(item.date, report.createdAt) });
        }
      });
    });
    return result.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [reports, expert]);

  const expertHighlights = useMemo(
    () => highlights.filter(h => matchesExpert(expert, h.expertName)),
    [highlights, expert]
  );

  const topTags = useMemo(() => {
    const counts: Record<string, number> = {};
    mentions.forEach(m => m.item.tags?.forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [mentions]);

  const startEditing = () => {
    setForm({
      imageUrl: expert.imageSource === 'manual' ? expert.imageUrl || '' : '',
      wikiTitle: expert.wikiTitle || '',
      twitterHandle: expert.twitterHandle || '',
      topics: expert.topics.join(', ')
    });
    setIsEditing(true);
  };

  const saveEdits = () => {
    const wikiTitle = normalizeWikiInput(form.wikiTitle);
    const manualImage = form.imageUrl.trim();
    const hadManualImage = expert.imageSource === 'manual';
    const updated: Expert = {
      ...expert,
      wikiTitle,
      twitterHandle: form.twitterHandle.trim() || undefined,
      topics: form.topics.split(',').map(t => t.trim()).filter(Boolean),
      ...(manualImage
        ? { imageUrl: manualImage, imageSource: 'manual' as const }
        : hadManualImage ? { imageUrl: undefined, imageSource: undefined } : {})
    };
    // Neu laden, wenn der Artikel geändert oder ein manuelles Bild entfernt wurde
    onSave(updated, wikiTitle !== expert.wikiTitle || (hadManualImage && !manualImage));
    setIsEditing(false);
  };

  const roleLine = [expert.role, expert.company && expert.company !== 'Unbekannt' ? expert.company : null]
    .filter(Boolean).join(' · ');

  const inputClass = 'w-full px-3 py-2 bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 text-sm';

  return (
    <article className="animate-in fade-in duration-300">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" /> Alle Experten
      </button>

      {/* Kopfbereich */}
      <header className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8 md:gap-12 border-b-2 border-zinc-900 pb-10">
        <div className="relative">
          <ExpertAvatar
            expert={expert}
            size={800}
            className="w-full aspect-[4/5] object-cover border-2 border-zinc-900 bg-zinc-100 cursor-zoom-in"
            onClick={() => setEnlarged(true)}
          />
          {expert.imageSource === 'wikipedia' && (
            <span className="absolute bottom-2 right-2 bg-white/90 text-[9px] font-bold uppercase tracking-widest text-zinc-500 px-2 py-1">
              Foto: Wikimedia Commons
            </span>
          )}
        </div>

        <div className="flex flex-col">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Experten-Dossier</div>
          <h2 className="text-5xl md:text-6xl editorial-headline font-black text-zinc-900 leading-[0.95] tracking-tight">
            {expert.name}
          </h2>
          {roleLine && <p className="editorial-text italic text-xl text-zinc-600 mt-4">{roleLine}</p>}

          {expert.topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {expert.topics.map(topic => (
                <span key={topic} className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 border border-zinc-300 px-2 py-1">
                  {topic}
                </span>
              ))}
            </div>
          )}

          <dl className="grid grid-cols-3 gap-4 mt-8 border-y border-zinc-200 py-4">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Erwähnungen</dt>
              <dd className="editorial-headline text-3xl font-black">{mentions.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Markierungen</dt>
              <dd className="editorial-headline text-3xl font-black">{expertHighlights.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Zuletzt</dt>
              <dd className="editorial-text text-lg mt-1.5">
                {mentions[0] ? mentions[0].date.toLocaleDateString('de-DE') : '–'}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => onToggleActive(expert.id)}
              className={`flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border transition-colors ${expert.active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-900'}`}
            >
              {expert.active ? <CheckCircle className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              {expert.active ? 'Wird beobachtet' : 'Pausiert'}
            </button>
            {expert.wikiUrl && (
              <a href={expert.wikiUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-zinc-300 text-zinc-700 hover:border-zinc-900 transition-colors">
                <BookOpen className="w-3.5 h-3.5" /> Wikipedia
              </a>
            )}
            {expert.twitterHandle && (
              <a href={`https://x.com/${expert.twitterHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-zinc-300 text-zinc-700 hover:border-zinc-900 transition-colors">
                <AtSign className="w-3.5 h-3.5" /> {expert.twitterHandle.replace('@', '')}
              </a>
            )}
            <button onClick={startEditing}
              className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-zinc-300 text-zinc-700 hover:border-zinc-900 transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Bearbeiten
            </button>
          </div>
        </div>
      </header>

      {/* Bearbeiten */}
      {isEditing && (
        <section className="bg-zinc-50 border border-zinc-200 p-6 mt-10 space-y-4">
          <SectionTitle>Profil bearbeiten</SectionTitle>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Wikipedia-Artikel (URL oder Titel, „-“ = keiner)</span>
            <input className={inputClass} value={form.wikiTitle} placeholder="automatisch – z.B. https://de.wikipedia.org/wiki/Doris_Weßels"
              onChange={e => setForm(f => ({ ...f, wikiTitle: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Eigenes Foto (Bild-URL, leer = automatisch)</span>
            <input className={inputClass} value={form.imageUrl} placeholder="https://…"
              onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">X-Handle</span>
              <input className={inputClass} value={form.twitterHandle} placeholder="@handle"
                onChange={e => setForm(f => ({ ...f, twitterHandle: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Themen (kommagetrennt)</span>
              <input className={inputClass} value={form.topics}
                onChange={e => setForm(f => ({ ...f, topics: e.target.value }))} />
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setIsEditing(false)} className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
              <X className="w-4 h-4" /> Abbrechen
            </button>
            <button onClick={saveEdits} className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-2 text-xs font-bold uppercase tracking-widest">
              <Check className="w-4 h-4" /> Speichern
            </button>
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-10 md:gap-12 mt-10">
        {/* Hauptspalte */}
        <div className="space-y-12">
          <section>
            <SectionTitle>Kurzbiografie</SectionTitle>
            {expert.wikiExtract || expert.description ? (
              <>
                <p className="editorial-text text-lg leading-relaxed text-zinc-800 first-letter:text-5xl first-letter:font-black first-letter:float-left first-letter:mr-2 first-letter:leading-none">
                  {expert.wikiExtract || expert.description}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-3">
                  Quelle: {expert.wikiExtract ? 'Wikipedia' : 'KI-Recherche (Gemini)'}
                </p>
              </>
            ) : (
              <p className="editorial-text italic text-zinc-500">Noch keine Biografie geladen.</p>
            )}
          </section>

          <section>
            <SectionTitle>Im AI Scout erwähnt</SectionTitle>
            {mentions.length === 0 ? (
              <p className="editorial-text italic text-zinc-500">
                Noch keine Erwähnungen. Sobald ein Deep Research Beiträge dieser Person findet, erscheinen sie hier als Zeitleiste.
              </p>
            ) : (
              <ol className="relative border-l-2 border-zinc-200 ml-2 space-y-8">
                {mentions.map((m, i) => (
                  <li key={i} className="pl-6 relative">
                    <span className="absolute -left-[7px] top-1.5 w-3 h-3 bg-zinc-900 rounded-full" />
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                      {m.date.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })} · {m.item.sourceType}
                    </div>
                    <h4 className="editorial-headline text-xl font-bold text-zinc-900 leading-snug">{m.item.headline}</h4>
                    <p className="editorial-text text-zinc-700 mt-2 leading-relaxed">{m.item.summary}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      {m.item.sourceUrl && (
                        <a href={m.item.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-900 underline underline-offset-4">
                          <ExternalLink className="w-3 h-3" /> {m.item.sourceName}
                        </a>
                      )}
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400">aus: {m.reportTitle}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Randspalte */}
        <aside className="space-y-12">
          <section>
            <SectionTitle>Relevanz im KI-Sektor</SectionTitle>
            <p className="editorial-text text-lg leading-relaxed text-zinc-800">
              {expert.relevance || <span className="italic text-zinc-500">Noch keine KI-Einschätzung vorhanden.</span>}
            </p>
            {expert.lastUpdated && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-3">
                KI-Einschätzung vom {new Date(expert.lastUpdated).toLocaleDateString('de-DE')}
              </p>
            )}
          </section>

          {topTags.length > 0 && (
            <section>
              <SectionTitle>Themen im Scout</SectionTitle>
              <ul className="space-y-2">
                {topTags.map(([tag, count]) => (
                  <li key={tag} className="flex items-center gap-3">
                    <span className="text-sm text-zinc-800 w-32 shrink-0 truncate" title={tag}>{tag}</span>
                    <span className="flex-1 h-2 bg-zinc-100">
                      <span className="block h-full bg-zinc-900" style={{ width: `${(count / topTags[0][1]) * 100}%` }} />
                    </span>
                    <span className="text-xs text-zinc-500 tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {expertHighlights.length > 0 && (
            <section>
              <SectionTitle>Deine Markierungen</SectionTitle>
              <div className="space-y-6">
                {expertHighlights.map(h => (
                  <blockquote key={h.id} className="border-l-4 border-zinc-900 pl-4">
                    <p className="editorial-text italic text-zinc-800">„{h.text}“</p>
                    <a href={h.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-2 hover:text-zinc-900">
                      <Bookmark className="w-3 h-3" /> {h.sourceName}
                    </a>
                  </blockquote>
                ))}
              </div>
            </section>
          )}

          <section className="bg-zinc-50 border border-zinc-200 p-5 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Wikipedia-Stand: {expert.wikiFetchedAt ? new Date(expert.wikiFetchedAt).toLocaleDateString('de-DE') : 'nie'}
            </div>
            <button onClick={() => onRefreshWiki(expert)} disabled={isRefreshing}
              className="w-full flex items-center justify-center gap-2 border border-zinc-900 px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-white disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Foto & Biografie neu laden
            </button>
            <button onClick={() => onRefreshAssessment(expert)} disabled={isRefreshing}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-800 disabled:opacity-50">
              <Sparkles className="w-3.5 h-3.5" /> KI-Einschätzung aktualisieren
            </button>
          </section>
        </aside>
      </div>

      {enlarged && (
        <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setEnlarged(false)}>
          <ExpertAvatar expert={expert} size={1024} className="max-w-full max-h-[90vh] object-contain" />
        </div>
      )}
    </article>
  );
};
