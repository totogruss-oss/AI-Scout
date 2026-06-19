import React, { useState, useEffect, useRef } from 'react';
import { Expert } from '../types';
import { Trash2, Plus, User, CheckCircle, Circle, X, RefreshCw, Info, Sparkles } from 'lucide-react';
import { analyzeExpertProfile } from '../services/geminiService';
import { INITIAL_EXPERTS } from '../constants';

interface ExpertListProps {
  experts: Expert[];
  setExperts: React.Dispatch<React.SetStateAction<Expert[]>>;
}

export const ExpertList: React.FC<ExpertListProps> = ({ experts, setExperts }) => {
  const [newExpertName, setNewExpertName] = useState('');
  const [newExpertRole, setNewExpertRole] = useState('');
  const [selectedExpert, setSelectedExpert] = useState<Expert | null>(null);
  const [updatingExpertId, setUpdatingExpertId] = useState<string | null>(null);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void, isAlert?: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Force update missing or overwritten image URLs from INITIAL_EXPERTS
    let hasChanges = false;
    const updatedExperts = experts.map(expert => {
      const initialExpert = INITIAL_EXPERTS.find(e => e.id === expert.id || e.name === expert.name);
      if (initialExpert && initialExpert.imageUrl && expert.imageUrl !== initialExpert.imageUrl) {
        hasChanges = true;
        return { ...expert, imageUrl: initialExpert.imageUrl };
      }
      return expert;
    });

    if (hasChanges) {
      setExperts(updatedExperts);
    }
  }, [experts, setExperts]);

  const handleUpdateList = async (listToUpdate: Expert[]) => {
    setIsUpdatingAll(true);

    for (let i = 0; i < listToUpdate.length; i++) {
      const expertToUpdate = listToUpdate[i];
      setUpdateProgress(`Lade Profil für ${expertToUpdate.name} (${i + 1}/${listToUpdate.length})...`);

      try {
        const profile = await analyzeExpertProfile(expertToUpdate.name);
        const updatedExpert = {
          ...expertToUpdate,
          role: profile.role,
          company: profile.company,
          description: profile.description,
          relevance: profile.relevance,
          imageUrl: expertToUpdate.imageUrl || profile.imageUrl,
          lastUpdated: new Date().toISOString()
        };

        setExperts(prevExperts => prevExperts.map(e => e.id === expertToUpdate.id ? updatedExpert : e));
        setSelectedExpert(prev => prev?.id === expertToUpdate.id ? updatedExpert : prev);
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
      message: "Möchtest du die Profile aller Experten neu generieren? Dies kann einen Moment dauern.",
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
        if (selectedExpert?.id === id) setSelectedExpert(null);
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
  };

  const handleUpdateProfile = async (expert: Expert) => {
    setUpdatingExpertId(expert.id);
    try {
      const profile = await analyzeExpertProfile(expert.name);
      const updatedExpert = {
        ...expert,
        role: profile.role,
        company: profile.company,
        description: profile.description,
        relevance: profile.relevance,
        imageUrl: expert.imageUrl || profile.imageUrl,
        lastUpdated: new Date().toISOString()
      };
      
      setExperts(prev => prev.map(e => e.id === expert.id ? updatedExpert : e));
      if (selectedExpert?.id === expert.id) {
        setSelectedExpert(updatedExpert);
      }
    } catch (error: any) {
      setConfirmDialog({
        message: `Fehler beim Aktualisieren des Profils: ${error?.message || 'Unbekannter Fehler'}\n\nMöglicherweise wurde das Limit für KI-Anfragen erreicht. Bitte warte kurz und versuche es erneut.`,
        onConfirm: () => setConfirmDialog(null),
        isAlert: true
      });
    } finally {
      setUpdatingExpertId(null);
    }
  };

  const filteredExperts = experts.filter(expert => 
    expert.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    expert.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (expert.company && expert.company.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="bg-white border-y-2 border-zinc-900 py-8 md:py-12 relative overflow-hidden">
      
      <div className="border-b-2 border-zinc-900 pb-6 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl md:text-5xl editorial-headline font-black text-zinc-900 uppercase tracking-tight flex items-center gap-4">
            <User className="w-8 h-8 text-zinc-900" />
            Experten ({experts.filter(e => e.active).length}/{experts.length})
          </h2>
          <p className="editorial-text text-zinc-600 mt-4 text-xl italic">
            Der Agent sucht nach Aktivitäten dieser Personen. Klicke auf einen Experten, um sein Profil zu sehen.
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
          placeholder="Experten durchsuchen..."
          className="w-full px-4 py-3 bg-white border-2 border-zinc-200 rounded-none text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 transition-all font-sans text-lg"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
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
            onClick={() => setSelectedExpert(expert)}
            className={`flex items-center justify-between p-5 border-l-4 transition-all duration-200 cursor-pointer ${expert.active ? 'border-zinc-900 bg-zinc-50 hover:bg-zinc-100' : 'border-zinc-200 bg-white opacity-60 hover:opacity-100 hover:bg-zinc-50'}`}
          >
            <div className="flex items-center gap-6">
              <button onClick={(e) => toggleActive(expert.id, e)} className="text-zinc-400 hover:text-zinc-900 transition-colors focus:outline-none shrink-0">
                {expert.active ? <CheckCircle className="w-6 h-6 text-zinc-900" /> : <Circle className="w-6 h-6" />}
              </button>
              
              {expert.imageUrl ? (
                <div 
                  className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-200 shrink-0 cursor-zoom-in"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImage(expert.imageUrl!);
                  }}
                >
                  <img 
                    src={expert.imageUrl} 
                    alt={expert.name} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer" 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(expert.name)}&background=f4f4f5&color=18181b`;
                    }}
                  />
                </div>
              ) : (
                <div 
                  className="w-12 h-12 rounded-full bg-zinc-200 border-2 border-zinc-300 shrink-0 flex items-center justify-center cursor-zoom-in"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImage(`https://ui-avatars.com/api/?name=${encodeURIComponent(expert.name)}&background=f4f4f5&color=18181b&size=512`);
                  }}
                >
                  <User className="w-6 h-6 text-zinc-400" />
                </div>
              )}

              <div>
                <div className={`font-bold text-sm uppercase tracking-widest ${expert.active ? 'text-zinc-900' : 'text-zinc-500'}`}>
                  {expert.name}
                </div>
                <div className="editorial-text text-zinc-600 mt-1 text-lg">
                  {expert.role} {expert.company && expert.company !== 'Unbekannt' ? `• ${expert.company}` : ''}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">
                  Update: {expert.lastUpdated ? new Date(expert.lastUpdated).toLocaleDateString('de-DE') : 'Nie'}
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
                Aktualisieren
              </button>
              <button onClick={(e) => removeExpert(expert.id, e)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )))}
      </div>

      {/* Expert Profile Modal */}
      {selectedExpert && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setSelectedExpert(null)}>
          <div className="bg-white border-2 border-zinc-900 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b-2 border-zinc-900 p-6 flex justify-between items-start z-10">
              <div className="flex items-start gap-6">
                {selectedExpert.imageUrl ? (
                  <div 
                    className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-zinc-200 shrink-0 cursor-zoom-in mt-2"
                    onClick={() => setSelectedImage(selectedExpert.imageUrl!)}
                  >
                    <img 
                      src={selectedExpert.imageUrl} 
                      alt={selectedExpert.name} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedExpert.name)}&background=f4f4f5&color=18181b`;
                      }}
                    />
                  </div>
                ) : (
                  <div 
                    className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-zinc-200 border-2 border-zinc-300 shrink-0 flex items-center justify-center mt-2 cursor-zoom-in"
                    onClick={() => setSelectedImage(`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedExpert.name)}&background=f4f4f5&color=18181b&size=512`)}
                  >
                    <User className="w-10 h-10 text-zinc-400" />
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Experten-Dossier</div>
                  <h3 className="text-4xl font-black editorial-headline uppercase tracking-tight text-zinc-900">{selectedExpert.name}</h3>
                  <p className="text-xl editorial-text italic text-zinc-600 mt-2">
                    {selectedExpert.role} {selectedExpert.company && selectedExpert.company !== 'Unbekannt' ? `• ${selectedExpert.company}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedExpert(null)} className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 shrink-0">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 space-y-8">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-900 border-b-2 border-zinc-900 pb-2 mb-4">Hintergrund</h4>
                <p className="editorial-text text-xl leading-relaxed text-zinc-800">
                  {selectedExpert.description || "Bisher keine Beschreibung vorhanden. Aktualisiere das Profil, um eine KI-Recherche durchzuführen."}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-900 border-b-2 border-zinc-900 pb-2 mb-4">Relevanz im KI-Sektor</h4>
                <p className="editorial-text text-xl leading-relaxed text-zinc-800">
                  {selectedExpert.relevance || "Bisher keine Relevanz-Einschätzung vorhanden."}
                </p>
              </div>

              <div className="bg-zinc-50 p-6 border border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Zuletzt aktualisiert: {selectedExpert.lastUpdated ? new Date(selectedExpert.lastUpdated).toLocaleDateString('de-DE') : 'Nie'}
                </div>
                <button 
                  onClick={() => handleUpdateProfile(selectedExpert)}
                  disabled={updatingExpertId === selectedExpert.id}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2 w-full sm:w-auto justify-center"
                >
                  {updatingExpertId === selectedExpert.id ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Recherchiere...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Profil aktualisieren
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
          <button 
            onClick={() => setSelectedImage(null)}
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-10 h-10" />
          </button>
          <img 
            src={selectedImage} 
            alt="Enlarged profile" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=Expert&background=f4f4f5&color=18181b`;
            }}
          />
        </div>
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
