import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Expert, ExpertCategory, Report } from '../types';
import { Trash2, Plus, User, CheckCircle, Circle, X, RefreshCw, Link2, FileText } from 'lucide-react';
import { analyzeExpertProfile, ExpertProfileResearch } from '../services/geminiService';
import { EXPERT_CATEGORIES } from '../constants';
import { applyOpenDataProfile, fetchOpenDataProfile, initialsAvatar, matchesExpertName, mergeLinks } from '../services/profileService';
import { ExpertProfile } from './ExpertProfile';

interface ExpertListProps {
  experts: Expert[];
  setExperts: React.Dispatch<React.SetStateAction<Expert[]>>;
  reports: Report[];
}

/** Übernimmt ein KI-Dossier, ohne verifizierte oder manuelle Daten zu überschreiben. */
const applyResearch = (expert: Expert, profile: ExpertProfileResearch): Expert => {
  const keepBio = expert.bio && (expert.bioOrigin === 'wikipedia' || expert.bioOrigin === 'manuell');
  return {
    ...expert,
    role: profile.role,
    company: profile.company,
    description: profile.description,
    relevance: profile.relevance,
    bio: keepBio ? expert.bio : (profile.bio || expert.bio),
    bioOrigin: keepBio ? expert.bioOrigin : (profile.bio ? 'ki' : expert.bioOrigin),
    currentFocus: profile.currentFocus || expert.currentFocus,
    positions: profile.positions || expert.positions,
    milestones: profile.milestones.length ? profile.milestones : expert.milestones,
    keyWorks: profile.keyWorks.length ? profile.keyWorks : expert.keyWorks,
    primaryChannels: profile.primaryChannels.length ? profile.primaryChannels : expert.primaryChannels,
    links: expert.manualOverrides?.links ? expert.links : mergeLinks(expert.links, profile.suggestedLinks),
    lastUpdated: new Date().toISOString(),
  };
};

export const ExpertList: React.FC<ExpertListProps> = ({ experts, setExperts, reports }) => {
  const [newExpertName, setNewExpertName] = useState('');
  const [newExpertRole, setNewExpertRole] = useState('');
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [updatingExpertId, setUpdatingExpertId] = useState<string | null>(null);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void, isAlert?: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<ExpertCategory | 'alle'>('alle');
  const autoEnrichStarted = useRef(false);

  const setEnriching = (id: string, on: boolean) =>
    setEnrichingIds(prev => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  const replaceExpert = (updated: Expert) => {
    setExperts(prev => prev.map(e => (e.id === updated.id ? updated : e)));
  };

  /** Wikidata/Wikipedia-Abgleich (kostenlos, ohne KI). */
  const enrichOpenData = async (expert: Expert) => {
    setEnriching(expert.id, true);
    try {
      const data = await fetchOpenDataProfile(expert);
      // Funktionales Update, damit parallele Änderungen nicht verloren gehen.
      setExperts(prev => prev.map(e => (e.id === expert.id ? applyOpenDataProfile(e, data) : e)));
      return data.found;
    } finally {
      setEnriching(expert.id, false);
    }
  };

  // Beim ersten Öffnen: alle noch nie abgeglichenen Profile im Hintergrund anreichern.
  useEffect(() => {
    if (autoEnrichStarted.current) return;
    autoEnrichStarted.current = true;
    const pending = experts.filter(e => !e.enrichedAt);
    (async () => {
      for (const expert of pending) {
        await enrichOpenData(expert);
        await new Promise(r => setTimeout(r, 250)); // Wikimedia-APIs schonen
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runResearch = async (expert: Expert) => {
    const profile = await analyzeExpertProfile(expert);
    setExperts(prev => prev.map(e => (e.id === expert.id ? applyResearch(e, profile) : e)));
  };

  const handleUpdateList = async (listToUpdate: Expert[]) => {
    setIsUpdatingAll(true);

    for (let i = 0; i < listToUpdate.length; i++) {
      const expertToUpdate = listToUpdate[i];
      setUpdateProgress(`Recherchiere ${expertToUpdate.name} (${i + 1}/${listToUpdate.length})...`);

      try {
        await enrichOpenData(expertToUpdate);
        await runResearch(expertToUpdate);
      } catch (error: any) {
        console.error("Fehler beim Aktualisieren von", expertToUpdate.name, error);
        if (error?.message?.includes('429') || error?.message?.toLowerCase().includes('quota')) {
          setConfirmDialog({
            message: "Das Limit für KI-Anfragen wurde erreicht. Der Vorgang wurde angehalten. Bitte warte einen Moment.",
            onConfirm: () => setConfirmDialog(null),
            isAlert: true
          });
          break;
        }
      }

      // Add a delay between requests to avoid rate limits
      if (i < listToUpdate.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    setIsUpdatingAll(false);
    setUpdateProgress('');
  };

  const handleForceUpdateAll = () => {
    if (isUpdatingAll) return;
    setConfirmDialog({
      message: "Alle Profile neu abgleichen (Wikidata) und KI-Dossiers neu erstellen? Das dauert einige Minuten und verbraucht KI-Kontingent.",
      onConfirm: () => {
        setConfirmDialog(null);
        handleUpdateList(experts);
      }
    });
  };

  const toggleActive = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExperts(prev => prev.map(exp => exp.id === id ? { ...exp, active: !exp.active } : exp));
  };

  const removeExpert = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({
      message: "Diesen Experten wirklich entfernen?",
      onConfirm: () => {
        setConfirmDialog(null);
        setExperts(prev => prev.filter(exp => exp.id !== id));
        if (selectedExpertId === id) setSelectedExpertId(null);
      }
    });
  };

  const addExpert = () => {
    if (!newExpertName.trim()) return;
    const newExpert: Expert = {
      id: crypto.randomUUID(),
      name: newExpertName,
      role: newExpertRole || 'Unbekannt',
      company: 'Unbekannt',
      topics: [],
      active: true
    };
    setExperts(prev => [newExpert, ...prev]);
    setNewExpertName('');
    setNewExpertRole('');
    enrichOpenData(newExpert);
  };

  const handleUpdateProfile = async (expert: Expert) => {
    setUpdatingExpertId(expert.id);
    try {
      await runResearch(expert);
    } catch (error: any) {
      setConfirmDialog({
        message: `Fehler beim Erstellen des KI-Dossiers: ${error?.message || 'Unbekannter Fehler'}\n\nMöglicherweise wurde das Limit für KI-Anfragen erreicht. Bitte warte kurz und versuche es erneut.`,
        onConfirm: () => setConfirmDialog(null),
        isAlert: true
      });
    } finally {
      setUpdatingExpertId(null);
    }
  };

  const handleEnrichOne = async (expert: Expert) => {
    const found = await enrichOpenData(expert);
    if (!found) {
      setConfirmDialog({
        message: `Zu „${expert.name}" wurde kein passender Wikidata-Eintrag gefunden. Du kannst unter „Bearbeiten" eine Wikidata-ID, ein Bild und Links manuell eintragen.`,
        onConfirm: () => setConfirmDialog(null),
        isAlert: true
      });
    }
  };

  const mentionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    experts.forEach(ex => {
      counts[ex.id] = reports.reduce((sum, r) => sum + r.items.filter(i => matchesExpertName(ex.name, i.expertName)).length, 0);
    });
    return counts;
  }, [experts, reports]);

  const selectedExpert = experts.find(e => e.id === selectedExpertId) || null;

  const filteredExperts = experts.filter(expert => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = expert.name.toLowerCase().includes(q) ||
      expert.role.toLowerCase().includes(q) ||
      (expert.company && expert.company.toLowerCase().includes(q)) ||
      expert.topics.some(t => t.toLowerCase().includes(q));
    const matchesCategory = categoryFilter === 'alle' || expert.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="bg-white border-y-2 border-zinc-900 py-8 md:py-12 relative overflow-hidden">
      
      <div className="border-b-2 border-zinc-900 pb-6 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl md:text-5xl editorial-headline font-black text-zinc-900 uppercase tracking-tight flex items-center gap-4">
            <User className="w-8 h-8 text-zinc-900" />
            Experten ({experts.filter(e => e.active).length}/{experts.length})
          </h2>
          <p className="editorial-text text-zinc-600 mt-4 text-xl italic">
            Der Agent sucht nach Aktivitäten dieser Personen. Klicke auf eine Person, um ihr ausführliches Profil zu öffnen.
          </p>
        </div>
        <div className="flex-shrink-0">
          {isUpdatingAll ? (
            <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-600">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {updateProgress}
            </div>
          ) : (
            <button 
              onClick={handleForceUpdateAll}
              className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Alle Profile aktualisieren
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 mb-8 bg-zinc-50 p-6 border border-zinc-200">
        <div className="flex-1">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-900 mb-4">Neuen Experten hinzufügen</h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="Name (z.B. Lex Fridman)"
              className="flex-1 px-4 py-3 bg-white border border-zinc-300 rounded-none text-zinc-900 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all font-sans"
              value={newExpertName}
              onChange={(e) => setNewExpertName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addExpert()}
            />
            <input
              type="text"
              placeholder="Rolle (Optional)"
              className="flex-1 px-4 py-3 bg-white border border-zinc-300 rounded-none text-zinc-900 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all font-sans"
              value={newExpertRole}
              onChange={(e) => setNewExpertRole(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addExpert()}
            />
            <button 
              onClick={addExpert}
              className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 rounded-none font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all focus:outline-none shrink-0"
            >
              <Plus className="w-4 h-4" />
              Hinzufügen
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Expert:innen, Rollen oder Themen durchsuchen..."
          className="w-full px-4 py-3 bg-white border-2 border-zinc-200 rounded-none text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 transition-all font-sans text-lg"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {(['alle', ...EXPERT_CATEGORIES] as const).map(cat => {
            const count = cat === 'alle' ? experts.length : experts.filter(e => e.category === cat).length;
            if (cat !== 'alle' && count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border transition-colors ${categoryFilter === cat ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-900'}`}
              >
                {cat === 'alle' ? 'Alle' : cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 mb-12">
        {filteredExperts.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 italic editorial-text">
            Keine Experten gefunden.
          </div>
        ) : (
          filteredExperts.map((expert) => (
          <div 
            key={expert.id} 
            onClick={() => setSelectedExpertId(expert.id)}
            className={`flex items-center justify-between p-5 border-l-4 transition-all duration-200 cursor-pointer ${expert.active ? 'border-zinc-900 bg-zinc-50 hover:bg-zinc-100' : 'border-zinc-200 bg-white opacity-60 hover:opacity-100 hover:bg-zinc-50'}`}
          >
            <div className="flex items-center gap-6">
              <button onClick={(e) => toggleActive(expert.id, e)} className="text-zinc-400 hover:text-zinc-900 transition-colors focus:outline-none shrink-0">
                {expert.active ? <CheckCircle className="w-6 h-6 text-zinc-900" /> : <Circle className="w-6 h-6" />}
              </button>
              
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-200 shrink-0 bg-zinc-100 flex items-center justify-center relative">
                {expert.imageUrl ? (
                  <img
                    src={expert.imageUrl}
                    alt={expert.name}
                    className="w-full h-full object-cover object-top"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).src = initialsAvatar(expert.name, 96); }}
                  />
                ) : enrichingIds.has(expert.id) ? (
                  <RefreshCw className="w-5 h-5 text-zinc-400 animate-spin" />
                ) : (
                  <User className="w-6 h-6 text-zinc-400" />
                )}
              </div>

              <div>
                <div className={`font-bold text-sm uppercase tracking-widest ${expert.active ? 'text-zinc-900' : 'text-zinc-500'}`}>
                  {expert.name}
                </div>
                <div className="editorial-text text-zinc-600 mt-1 text-lg">
                  {expert.role} {expert.company && expert.company !== 'Unbekannt' ? `• ${expert.company}` : ''}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">
                  {expert.category && <span className="text-zinc-500">{expert.category}</span>}
                  <span className="flex items-center gap-1" title="Hinterlegte Links"><Link2 className="w-3 h-3" />{expert.links?.length || 0}</span>
                  <span className="flex items-center gap-1" title="Erwähnungen in Reports"><FileText className="w-3 h-3" />{mentionCounts[expert.id] || 0}</span>
                  <span>Dossier: {expert.lastUpdated ? new Date(expert.lastUpdated).toLocaleDateString('de-DE') : 'Nie'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdateProfile(expert);
                }}
                disabled={updatingExpertId === expert.id}
                className="hidden sm:flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest text-zinc-600 bg-zinc-50 hover:bg-zinc-100 px-3 py-2 border border-zinc-200 transition-colors"
              >
                {updatingExpertId === expert.id ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                KI-Dossier
              </button>
              <button onClick={(e) => removeExpert(expert.id, e)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )))}
      </div>

      {/* Expert Profile Page */}
      {selectedExpert && (
        <ExpertProfile
          expert={selectedExpert}
          reports={reports}
          isEnriching={enrichingIds.has(selectedExpert.id)}
          isResearching={updatingExpertId === selectedExpert.id}
          onClose={() => setSelectedExpertId(null)}
          onSave={replaceExpert}
          onEnrichOpenData={handleEnrichOne}
          onResearch={handleUpdateProfile}
          onToggleActive={(ex) => replaceExpert({ ...ex, active: !ex.active })}
        />
      )}

      {/* Confirm/Alert Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="bg-white border-2 border-zinc-900 w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold uppercase tracking-tight text-zinc-900 mb-4">
              {confirmDialog.isAlert ? 'Hinweis' : 'Bestätigung'}
            </h3>
            <p className="text-zinc-600 mb-8">{confirmDialog.message}</p>
            <div className="flex justify-end gap-4">
              {!confirmDialog.isAlert && (
                <button 
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 text-sm font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  Abbrechen
                </button>
              )}
              <button 
                onClick={confirmDialog.onConfirm}
                className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-2 text-sm font-bold uppercase tracking-widest transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
