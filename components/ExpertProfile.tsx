import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, AtSign, BookOpen, CheckCircle, Circle, Database, ExternalLink, Github, Globe,
  GraduationCap, Linkedin, Mic, Newspaper, Pencil, Plus, RefreshCw, Rss, Save, Sparkles,
  Trash2, Twitter, User, X, Youtube, AlertTriangle,
} from 'lucide-react';
import { DataOrigin, Expert, ExpertCategory, ExpertLink, ExpertLinkType, Report, ReportItem } from '../types';
import {
  LINK_TYPE_LABELS, ORIGIN_LABELS, initialsAvatar, isSafeHttpUrl, matchesExpertName,
} from '../services/profileService';
import { EXPERT_CATEGORIES } from '../constants';

interface ExpertProfileProps {
  expert: Expert;
  reports: Report[];
  isEnriching: boolean;
  isResearching: boolean;
  onClose: () => void;
  onSave: (expert: Expert) => void;
  onEnrichOpenData: (expert: Expert) => void;
  onResearch: (expert: Expert) => void;
  onToggleActive: (expert: Expert) => void;
}

const LINK_ICONS: Record<ExpertLinkType, React.FC<{ className?: string }>> = {
  website: Globe,
  x: Twitter,
  linkedin: Linkedin,
  bluesky: AtSign,
  mastodon: AtSign,
  threads: AtSign,
  github: Github,
  youtube: Youtube,
  scholar: GraduationCap,
  substack: Rss,
  blog: Newspaper,
  podcast: Mic,
  wikipedia: BookOpen,
  other: ExternalLink,
};

const LINK_ORDER: ExpertLinkType[] = [
  'website', 'blog', 'substack', 'x', 'linkedin', 'bluesky', 'mastodon', 'threads',
  'youtube', 'podcast', 'github', 'scholar', 'wikipedia', 'other',
];

const OriginBadge: React.FC<{ origin?: DataOrigin }> = ({ origin }) => {
  if (!origin) return null;
  const tone = origin === 'ki'
    ? 'bg-amber-50 text-amber-800 border-amber-300'
    : 'bg-zinc-100 text-zinc-500 border-zinc-200';
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${tone}`}>
      {origin === 'ki' && <AlertTriangle className="w-2.5 h-2.5" />}
      {ORIGIN_LABELS[origin]}
    </span>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode; origin?: DataOrigin }> = ({ children, origin }) => (
  <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-2 mb-4 gap-2">
    <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-900">{children}</h4>
    <OriginBadge origin={origin} />
  </div>
);

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : 'Nie');

export const ExpertProfile: React.FC<ExpertProfileProps> = ({
  expert, reports, isEnriching, isResearching, onClose, onSave, onEnrichOpenData, onResearch, onToggleActive,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Expert>(expert);
  const [newLinkType, setNewLinkType] = useState<ExpertLinkType>('linkedin');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  // Wenn sich das Profil von außen ändert (Anreicherung), Entwurf nachziehen – außer im Editiermodus.
  React.useEffect(() => {
    if (!isEditing) setDraft(expert);
    setImgFailed(false);
  }, [expert, isEditing]);

  const mentions = useMemo(() => {
    const items: (ReportItem & { reportDate: string })[] = [];
    reports.forEach(r => r.items.forEach(item => {
      if (matchesExpertName(expert.name, item.expertName)) items.push({ ...item, reportDate: r.createdAt });
    }));
    return items.sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());
  }, [reports, expert.name]);

  const sortedLinks = useMemo(
    () => [...(expert.links || [])].sort((a, b) => LINK_ORDER.indexOf(a.type) - LINK_ORDER.indexOf(b.type)),
    [expert.links]
  );
  const verifiedLinks = sortedLinks.filter(l => l.origin !== 'ki');
  const suggestedLinks = sortedLinks.filter(l => l.origin === 'ki');

  const imageSrc = !imgFailed && expert.imageUrl ? expert.imageUrl : initialsAvatar(expert.name, 512);

  // --- Bearbeiten -----------------------------------------------------------
  const updateDraft = (patch: Partial<Expert>) => setDraft(prev => ({ ...prev, ...patch }));

  const addDraftLink = () => {
    const url = newLinkUrl.trim();
    if (!isSafeHttpUrl(url)) return;
    updateDraft({ links: [...(draft.links || []), { type: newLinkType, url, origin: 'manuell' }] });
    setNewLinkUrl('');
  };

  const removeDraftLink = (idx: number) =>
    updateDraft({ links: (draft.links || []).filter((_, i) => i !== idx) });

  const confirmDraftLink = (idx: number) =>
    updateDraft({ links: (draft.links || []).map((l, i) => (i === idx ? { ...l, origin: 'manuell' as const } : l)) });

  const saveDraft = () => {
    const imageChanged = (draft.imageUrl || '') !== (expert.imageUrl || '');
    // Nur Löschungen sperren die Links: sonst kämen gelöschte Links beim nächsten Abgleich zurück.
    // Neu hinzugefügte Links sind als „manuell" ohnehin vor Überschreiben geschützt.
    const draftUrls = new Set((draft.links || []).map(l => l.url));
    const linksChanged = (expert.links || []).some(l => !draftUrls.has(l.url));
    const bioChanged = (draft.bio || '') !== (expert.bio || '');
    onSave({
      ...draft,
      imageOrigin: imageChanged ? (draft.imageUrl ? 'manuell' : undefined) : draft.imageOrigin,
      imageCredit: imageChanged ? undefined : draft.imageCredit,
      bioOrigin: bioChanged ? 'manuell' : draft.bioOrigin,
      wikidataId: draft.wikidataId?.trim() || undefined,
      manualOverrides: {
        imageUrl: draft.manualOverrides?.imageUrl || (imageChanged && !!draft.imageUrl),
        links: draft.manualOverrides?.links || linksChanged,
      },
    });
    setIsEditing(false);
  };

  const inputCls = 'w-full px-3 py-2 bg-white border border-zinc-300 text-zinc-900 focus:outline-none focus:border-zinc-900 font-sans text-sm';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1';

  return (
    <div className="fixed inset-0 z-[100] bg-[#fdfcfb] overflow-y-auto animate-in fade-in duration-200">
      {/* Aktionsleiste */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b-2 border-zinc-900">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <button onClick={onClose} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-700 hover:text-zinc-900">
            <ArrowLeft className="w-4 h-4" /> Zur Expertenliste
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {isEditing ? (
              <>
                <button onClick={() => { setDraft(expert); setIsEditing(false); }} className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
                  Abbrechen
                </button>
                <button onClick={saveDraft} className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest">
                  <Save className="w-3.5 h-3.5" /> Speichern
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onEnrichOpenData(expert)}
                  disabled={isEnriching}
                  title="Verifizierte Links, Bild und Kurzbiografie aus Wikidata/Wikipedia laden"
                  className="flex items-center gap-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-300 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-700 disabled:opacity-50"
                >
                  {isEnriching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  Wikidata abgleichen
                </button>
                <button
                  onClick={() => onResearch(expert)}
                  disabled={isResearching}
                  title="Ausführliches Dossier per KI-Websuche erstellen"
                  className="flex items-center gap-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-300 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-700 disabled:opacity-50"
                >
                  {isResearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {isResearching ? 'Recherchiere…' : 'KI-Dossier'}
                </button>
                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest">
                  <Pencil className="w-3.5 h-3.5" /> Bearbeiten
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Kopfbereich */}
        <header className="flex flex-col md:flex-row gap-8 md:gap-10 border-b-2 border-zinc-900 pb-10">
          <figure className="shrink-0 w-40 md:w-56">
            <div className="aspect-[4/5] w-full overflow-hidden border-2 border-zinc-900 bg-zinc-100">
              {expert.imageUrl && !imgFailed ? (
                <img
                  src={imageSrc}
                  alt={`Porträt ${expert.name}`}
                  className="w-full h-full object-cover object-top"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-16 h-16 text-zinc-300" />
                </div>
              )}
            </div>
            <figcaption className="mt-2 text-[10px] leading-snug text-zinc-400 break-words">
              {expert.imageUrl && !imgFailed
                ? <>Bild: {expert.imageCredit || ORIGIN_LABELS[expert.imageOrigin || 'manuell']}</>
                : 'Kein Bild – „Wikidata abgleichen" oder Bild-URL eintragen.'}
            </figcaption>
          </figure>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Experten-Dossier</span>
              {expert.category && (
                <span className="text-[10px] font-bold uppercase tracking-widest bg-zinc-900 text-white px-2 py-0.5">{expert.category}</span>
              )}
              <button
                onClick={() => onToggleActive(expert)}
                className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border ${expert.active ? 'border-zinc-900 text-zinc-900' : 'border-zinc-300 text-zinc-400'}`}
                title="Im Research berücksichtigen?"
              >
                {expert.active ? <CheckCircle className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                {expert.active ? 'Wird beobachtet' : 'Pausiert'}
              </button>
            </div>

            <h1 className="text-4xl md:text-6xl font-black editorial-headline uppercase tracking-tight text-zinc-900 leading-none break-words">
              {expert.name}
            </h1>
            <p className="text-xl md:text-2xl editorial-text italic text-zinc-600 mt-3">
              {expert.role}{expert.company && expert.company !== 'Unbekannt' ? ` • ${expert.company}` : ''}
            </p>

            {expert.whyFollow && !isEditing && (
              <blockquote className="mt-6 border-l-4 border-zinc-900 pl-4 editorial-text text-lg md:text-xl text-zinc-800">
                {expert.whyFollow}
              </blockquote>
            )}

            {/* Links */}
            {!isEditing && (
              <div className="mt-6">
                {verifiedLinks.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {verifiedLinks.map(l => {
                      const Icon = LINK_ICONS[l.type];
                      return (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${LINK_TYPE_LABELS[l.type]} · Quelle: ${ORIGIN_LABELS[l.origin]}`}
                          className="flex items-center gap-2 border border-zinc-300 bg-white hover:border-zinc-900 hover:bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-800 transition-colors"
                        >
                          <Icon className="w-4 h-4" />
                          {l.label || LINK_TYPE_LABELS[l.type]}
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 italic">Noch keine verifizierten Links hinterlegt.</p>
                )}

                {suggestedLinks.length > 0 && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-800 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> KI-Vorschläge – bitte vor Nutzung prüfen
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {suggestedLinks.map(l => {
                        const Icon = LINK_ICONS[l.type];
                        return (
                          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900 hover:border-amber-600">
                            <Icon className="w-3.5 h-3.5" /> {l.label || LINK_TYPE_LABELS[l.type]}
                          </a>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-amber-800 mt-2">Unter „Bearbeiten" kannst du Vorschläge bestätigen oder löschen.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {isEditing ? (
          /* ---------------- Bearbeitungsmodus ---------------- */
          <div className="py-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>Rolle</label>
              <input className={inputCls} value={draft.role} onChange={e => updateDraft({ role: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Organisation</label>
              <input className={inputCls} value={draft.company || ''} onChange={e => updateDraft({ company: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Kategorie</label>
              <select className={inputCls} value={draft.category || ''} onChange={e => updateDraft({ category: (e.target.value || undefined) as ExpertCategory | undefined })}>
                <option value="">– keine –</option>
                {EXPERT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>X-Handle (für die Recherche)</label>
              <input className={inputCls} placeholder="@handle" value={draft.twitterHandle || ''} onChange={e => updateDraft({ twitterHandle: e.target.value || undefined })} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Warum folge ich dieser Person?</label>
              <textarea rows={2} className={inputCls} value={draft.whyFollow || ''} onChange={e => updateDraft({ whyFollow: e.target.value || undefined })} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Bild-URL (überschreibt Wikidata/Wikipedia dauerhaft)</label>
              <input className={inputCls} placeholder="https://…" value={draft.imageUrl || ''} onChange={e => updateDraft({ imageUrl: e.target.value || undefined })} />
              {draft.manualOverrides?.imageUrl && (
                <button className="mt-1 text-[11px] underline text-zinc-500" onClick={() => updateDraft({ manualOverrides: { ...draft.manualOverrides, imageUrl: false } })}>
                  Sperre aufheben (Bild wieder automatisch beziehen)
                </button>
              )}
            </div>
            <div>
              <label className={labelCls}>Wikidata-ID (bei falscher Zuordnung korrigieren)</label>
              <input className={inputCls} placeholder="z. B. Q92894" value={draft.wikidataId || ''} onChange={e => updateDraft({ wikidataId: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Themen (kommagetrennt)</label>
              <input className={inputCls} value={(draft.topics || []).join(', ')} onChange={e => updateDraft({ topics: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Biografie</label>
              <textarea rows={5} className={inputCls} value={draft.bio || ''} onChange={e => updateDraft({ bio: e.target.value || undefined })} />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Links</label>
              <div className="space-y-2">
                {(draft.links || []).map((l, idx) => (
                  <div key={`${l.url}-${idx}`} className="flex flex-wrap items-center gap-2 bg-white border border-zinc-200 px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-28 shrink-0">{LINK_TYPE_LABELS[l.type]}</span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-sm text-zinc-800 underline">{l.url}</a>
                    <OriginBadge origin={l.origin} />
                    {l.origin === 'ki' && (
                      <button onClick={() => confirmDraftLink(idx)} className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 hover:underline">Bestätigen</button>
                    )}
                    <button onClick={() => removeDraftLink(idx)} className="p-1 text-zinc-400 hover:text-red-600" aria-label="Link entfernen">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex flex-col sm:flex-row gap-2">
                  <select className={`${inputCls} sm:w-44`} value={newLinkType} onChange={e => setNewLinkType(e.target.value as ExpertLinkType)}>
                    {LINK_ORDER.map(t => <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>)}
                  </select>
                  <input className={inputCls} placeholder="https://…" value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDraftLink()} />
                  <button onClick={addDraftLink} disabled={!isSafeHttpUrl(newLinkUrl.trim())} className="flex items-center justify-center gap-1 bg-zinc-900 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40 shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Link
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ---------------- Lesemodus ---------------- */
          <div className="py-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
            <main className="lg:col-span-2 space-y-10">
              <section>
                <SectionTitle origin={expert.bio ? expert.bioOrigin : undefined}>Biografie</SectionTitle>
                <p className="editorial-text text-lg md:text-xl leading-relaxed text-zinc-800 whitespace-pre-line">
                  {expert.bio || expert.description || 'Noch keine Biografie. „Wikidata abgleichen" lädt den Wikipedia-Auszug, „KI-Dossier" erstellt eine ausführliche Recherche.'}
                </p>
                {expert.bio && expert.bioOrigin === 'wikipedia' && expert.wikipediaTitle && (
                  <a
                    href={`https://${expert.wikipediaLang || 'en'}.wikipedia.org/wiki/${encodeURIComponent(expert.wikipediaTitle.replace(/ /g, '_'))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-3 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900"
                  >
                    Weiterlesen auf Wikipedia <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </section>

              <section>
                <SectionTitle origin={expert.relevance ? 'ki' : undefined}>Relevanz im KI-Sektor</SectionTitle>
                <p className="editorial-text text-lg leading-relaxed text-zinc-800">
                  {expert.relevance || 'Noch keine Einschätzung. Erstelle ein KI-Dossier.'}
                </p>
              </section>

              {(expert.currentFocus || expert.positions) && (
                <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {expert.currentFocus && (
                    <div>
                      <SectionTitle origin="ki">Aktueller Fokus</SectionTitle>
                      <p className="editorial-text text-lg leading-relaxed text-zinc-800">{expert.currentFocus}</p>
                    </div>
                  )}
                  {expert.positions && (
                    <div>
                      <SectionTitle origin="ki">Positionen in der Debatte</SectionTitle>
                      <p className="editorial-text text-lg leading-relaxed text-zinc-800">{expert.positions}</p>
                    </div>
                  )}
                </section>
              )}

              {expert.milestones && expert.milestones.length > 0 && (
                <section>
                  <SectionTitle origin="ki">Werdegang</SectionTitle>
                  <ol className="relative border-l-2 border-zinc-200 ml-2 space-y-5">
                    {expert.milestones.map((m, i) => (
                      <li key={i} className="pl-6 relative">
                        <span className="absolute -left-[7px] top-1.5 w-3 h-3 bg-zinc-900 rounded-full" />
                        <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">{m.year}</div>
                        <div className="editorial-text text-lg text-zinc-800">{m.text}</div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {expert.keyWorks && expert.keyWorks.length > 0 && (
                <section>
                  <SectionTitle origin="ki">Schlüsselwerke</SectionTitle>
                  <ul className="space-y-2">
                    {expert.keyWorks.map((w, i) => (
                      <li key={i} className="editorial-text text-lg text-zinc-800 flex gap-3">
                        <span className="text-zinc-400 font-bold">{String(i + 1).padStart(2, '0')}</span>{w}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </main>

            <aside className="space-y-8">
              <div className="bg-white border-2 border-zinc-900 p-5">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-900 mb-3">Im AI Scout</h4>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-zinc-900">{mentions.length}</span>
                  <span className="text-xs uppercase tracking-widest text-zinc-500">Erwähnungen in {reports.length} Reports</span>
                </div>
                {mentions.length === 0 ? (
                  <p className="text-sm text-zinc-500 mt-3">
                    {reports.length === 0
                      ? 'Noch keine Reports vorhanden.'
                      : 'Bisher kein Treffer – ein Hinweis, ob sich das Beobachten lohnt.'}
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {mentions.slice(0, 5).map((m, i) => (
                      <li key={i} className="text-sm">
                        <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-zinc-900 hover:underline">{m.headline}</a>
                        <div className="text-[11px] text-zinc-500">{m.sourceName} · {formatDate(m.reportDate)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {expert.primaryChannels && expert.primaryChannels.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-900 border-b border-zinc-300 pb-2 mb-3">Publiziert vor allem über</h4>
                  <div className="flex flex-wrap gap-2">
                    {expert.primaryChannels.map(c => (
                      <span key={c} className="text-xs bg-zinc-100 border border-zinc-200 px-2 py-1 text-zinc-700">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {expert.topics.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-900 border-b border-zinc-300 pb-2 mb-3">Themen</h4>
                  <div className="flex flex-wrap gap-2">
                    {expert.topics.map(t => (
                      <span key={t} className="text-xs bg-white border border-zinc-300 px-2 py-1 text-zinc-700">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-zinc-500 space-y-2 border-t border-zinc-300 pt-4">
                <h4 className="font-bold uppercase tracking-widest text-zinc-900">Datenquellen</h4>
                <div>Wikidata: {expert.wikidataId ? (
                  <a className="underline" href={`https://www.wikidata.org/wiki/${expert.wikidataId}`} target="_blank" rel="noopener noreferrer">{expert.wikidataId}</a>
                ) : 'nicht verknüpft'}</div>
                <div>Abgleich offene Daten: {formatDate(expert.enrichedAt)}</div>
                <div>KI-Dossier: {formatDate(expert.lastUpdated)}</div>
                {(expert.manualOverrides?.imageUrl || expert.manualOverrides?.links) && (
                  <div className="flex items-center gap-1"><X className="w-3 h-3" /> Manuell gesperrt: {[
                    expert.manualOverrides?.imageUrl && 'Bild', expert.manualOverrides?.links && 'Links',
                  ].filter(Boolean).join(', ')}</div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
