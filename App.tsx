import React, { useState, useEffect } from 'react';
import { ExpertList } from './components/ExpertList';
import { Newsletter } from './components/Newsletter';
import { KnowledgeBase } from './components/KnowledgeBase';
import { FastScanView } from './components/FastScanView';
import { generateResearchReport, generateFastScan } from './services/geminiService';
import { Expert, Report, AppState, Highlight } from './types';
import { INITIAL_EXPERTS } from './constants';
import { Sparkles, CalendarClock, Play, Menu, User, Zap, Bookmark, ExternalLink, Calendar } from 'lucide-react';
import { RelativeTimeBadge } from './components/RelativeTimeBadge';
import { Sidebar } from './components/Sidebar';

// Simple persistence helper
const loadState = (): AppState => {
  const saved = localStorage.getItem('ai_scout_state_v1');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (!parsed.experts || parsed.experts.length === 0) {
        parsed.experts = INITIAL_EXPERTS;
    } else {
        // Alte Bild-URLs ohne Herkunftsangabe stammen aus geratenen Wikimedia-Links und sind oft kaputt.
        // Sie werden verworfen und beim nächsten Öffnen der Expertenansicht aus Wikipedia neu geladen.
        parsed.experts = parsed.experts.map((expert: Expert) =>
            expert.imageUrl && !expert.imageSource ? { ...expert, imageUrl: undefined } : expert
        ).map((expert: Expert) =>
            // Selbst gebaute 800px-Thumbnails blockiert Wikimedia (nur Standardgrößen erlaubt) → neu laden
            expert.imageSource === 'wikipedia' && expert.imageUrl?.includes('/800px-')
              ? { ...expert, imageUrl: undefined, imageSource: undefined, wikiFetchedAt: undefined }
              : expert
        );
    }
    if (!parsed.highlights) {
        parsed.highlights = [];
    }
    if (!parsed.fastScans) {
        parsed.fastScans = [];
    }
    // Ensure we don't load a stuck generating state
    parsed.isGenerating = false;
    parsed.progressMessage = '';
    return parsed;
  }
  return {
    experts: INITIAL_EXPERTS,
    reports: [],
    highlights: [],
    fastScans: [],
    isGenerating: false,
    progressMessage: ''
  };
};

export default function App() {
  const [state, setState] = useState<AppState>(loadState());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'experts' | 'archive'>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('ai_scout_state_v1', JSON.stringify(state));
  }, [state]);
  
  const handleUpdateExperts = (action: React.SetStateAction<Expert[]>) => {
    setState(prev => ({
      ...prev,
      experts: typeof action === 'function' ? action(prev.experts) : action
    }));
  };

  const handleResetExperts = () => {
    if(confirm("Dies setzt deine Expertenliste auf die Standard-Liste (21 Forscher) zurück. Deine eigenen Änderungen gehen verloren. Fortfahren?")) {
        setState(prev => ({ ...prev, experts: INITIAL_EXPERTS }));
    }
  }

  const handleSaveHighlight = (highlight: Highlight) => {
    setState(prev => ({
      ...prev,
      highlights: [highlight, ...prev.highlights]
    }));
  };

  const handleRunResearch = async () => {
    if (state.isGenerating) return;

    setState(prev => ({ ...prev, isGenerating: true, generatingType: 'deep', progressMessage: 'Initialisiere Deep Research...' }));

    try {
      const report = await generateResearchReport(state.experts, (msg) => {
        setState(prev => ({ ...prev, progressMessage: msg }));
      });

      setState(prev => ({
        ...prev,
        isGenerating: false,
        generatingType: undefined,
        reports: [report, ...prev.reports]
      }));
      setActiveTab('dashboard');
    } catch (e) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        generatingType: undefined,
        progressMessage: 'Fehler aufgetreten.'
      }));
      alert("Es gab ein Problem bei der Recherche. Bitte überprüfe deinen API Key oder versuche es später noch einmal.");
    }
  };

  const handleRunFastScan = async () => {
    if (state.isGenerating) return;

    setState(prev => ({ ...prev, isGenerating: true, generatingType: 'quick', progressMessage: 'Starte Fast Scan...' }));

    try {
      const scan = await generateFastScan((msg) => {
        setState(prev => ({ ...prev, progressMessage: msg }));
      });

      setState(prev => ({
        ...prev,
        isGenerating: false,
        generatingType: undefined,
        fastScans: [scan, ...prev.fastScans]
      }));
      setActiveTab('dashboard');
    } catch (e) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        generatingType: undefined,
        progressMessage: 'Fehler aufgetreten.'
      }));
      alert("Es gab ein Problem beim Fast Scan. Bitte überprüfe deinen API Key oder versuche es später noch einmal.");
    }
  };

  const latestReport = state.reports[0];
  const latestFastScan = state.fastScans[0];
  
  // Check if report is due (older than 2 days)
  const isUpdateDue = !latestReport || (Date.now() - new Date(latestReport.createdAt).getTime()) > (1000 * 60 * 60 * 24 * 2);

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-zinc-200">
      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} state={state} />
      
      {/* Header */}
      <header className="border-b-2 border-zinc-900 bg-white sticky top-0 z-50">
        {/* Top small bar */}
        <div className="border-b border-zinc-200 py-1.5 hidden sm:block">
           <div className="max-w-7xl mx-auto px-4 flex justify-between items-center text-[10px] uppercase tracking-widest font-bold text-zinc-500">
              <span>{new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span>Edition 1.0</span>
           </div>
        </div>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="flex items-center gap-2 text-zinc-900 hover:text-zinc-600 font-medium"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="text-4xl md:text-5xl font-black editorial-headline tracking-tighter uppercase">
              AI Scout
            </div>
            <button className="text-zinc-900 hover:text-zinc-600">
              <User className="w-6 h-6" />
            </button>
          </div>
        </div>
        <div className="border-t border-zinc-200">
          <div className="max-w-7xl mx-auto px-4">
            <nav className="flex justify-center gap-8 py-3 overflow-x-auto">
              <button 
                onClick={() => setActiveTab('dashboard')} 
                className={`text-xs uppercase tracking-widest font-bold whitespace-nowrap transition-colors ${activeTab === 'dashboard' ? 'text-zinc-900 border-b-2 border-zinc-900 pb-1' : 'text-zinc-500 hover:text-zinc-900 pb-1'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('experts')} 
                className={`text-xs uppercase tracking-widest font-bold whitespace-nowrap transition-colors ${activeTab === 'experts' ? 'text-zinc-900 border-b-2 border-zinc-900 pb-1' : 'text-zinc-500 hover:text-zinc-900 pb-1'}`}
              >
                Experten ({state.experts.length})
              </button>
              <button 
                onClick={() => setActiveTab('archive')} 
                className={`text-xs uppercase tracking-widest font-bold whitespace-nowrap transition-colors ${activeTab === 'archive' ? 'text-zinc-900 border-b-2 border-zinc-900 pb-1' : 'text-zinc-500 hover:text-zinc-900 pb-1'}`}
              >
                Wissensdatenbank
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`${activeTab === 'experts' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-4 py-12`}>
        
        {/* Progress Overlay */}
        {state.isGenerating && (
          <div className="fixed inset-0 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center z-[100] text-zinc-900">
            <div className="relative w-20 h-20 mb-10">
              <div className="absolute inset-0 border-2 border-zinc-200 rounded-full"></div>
              <div className="absolute inset-0 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-4xl md:text-5xl editorial-headline font-black mb-4 uppercase tracking-tight">
              {state.generatingType === 'quick' ? 'Quick Research läuft' : 'Deep Research läuft'}
            </h2>
            <p className="text-zinc-600 font-mono text-sm animate-pulse uppercase tracking-widest">{state.progressMessage}</p>
            <div className="mt-12 max-w-md text-center text-lg text-zinc-600 border-y-2 border-zinc-900 bg-white p-6 italic editorial-text">
              {state.generatingType === 'quick' 
                ? `Der Agent scannt die neuesten Updates der ${state.experts.filter(e => e.active).length} Experten. Dies dauert ca. 10 Sekunden.`
                : `Der Agent scannt Papers, Social Media und News der ${state.experts.filter(e => e.active).length} Experten. Dies kann bis zu 60 Sekunden dauern.`
              }
            </div>
            <button 
              onClick={() => setState(prev => ({ ...prev, isGenerating: false, generatingType: undefined, progressMessage: '' }))}
              className="mt-8 px-6 py-2 border-2 border-zinc-900 text-zinc-900 font-bold text-xs uppercase tracking-widest hover:bg-zinc-900 hover:text-white transition-colors"
            >
              Abbrechen
            </button>
          </div>
        )}

        {/* Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Action Bar / Hero */}
            <div className="flex flex-col sm:flex-row justify-center gap-4 max-w-2xl mx-auto">
              <button 
                onClick={handleRunFastScan}
                disabled={state.isGenerating}
                className="flex-1 bg-white hover:bg-zinc-50 border-2 border-zinc-900 p-4 flex items-center justify-center gap-4 text-left transition-all group"
              >
                <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Zap className="w-5 h-5 text-zinc-900" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Quick Research</h3>
                  <p className="text-zinc-600 italic editorial-text text-sm">~10 Sekunden</p>
                </div>
              </button>

              <button 
                onClick={handleRunResearch}
                disabled={state.isGenerating}
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white p-4 flex items-center justify-center gap-4 text-left transition-all group"
              >
                <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Deep Research</h3>
                  <p className="text-zinc-400 italic editorial-text text-sm">~60 Sekunden</p>
                </div>
              </button>
            </div>

            {/* Highlights Section */}
            {state.highlights.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-8 border-b-2 border-zinc-900 pb-4">
                  <Bookmark className="w-6 h-6" />
                  <h2 className="text-3xl font-black uppercase tracking-tight">Deine letzten Markierungen</h2>
                </div>
                <div className="grid gap-6">
                  {state.highlights.slice(0, 3).map((highlight) => (
                    <div key={highlight.id} className="bg-white p-6 md:p-8 border-2 border-zinc-900 hover:bg-zinc-50 transition-all">
                       <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-6 gap-4">
                          <div className="flex flex-wrap items-center gap-3">
                             <span className="font-bold text-zinc-900 text-xs uppercase tracking-widest border-b-2 border-zinc-900 pb-1">{highlight.expertName}</span>
                             <span className="text-zinc-300 hidden md:inline">•</span>
                             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Bookmark className="w-3.5 h-3.5" />
                                Markiert am {new Date(highlight.highlightDate).toLocaleDateString('de-DE')}
                             </span>
                             <RelativeTimeBadge dateStr={highlight.highlightDate} />
                          </div>
                          <a 
                            href={highlight.sourceUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200 transition-colors flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {highlight.sourceName}
                          </a>
                       </div>
                       
                       <blockquote className="editorial-text text-xl md:text-2xl text-zinc-900 leading-relaxed border-l-4 border-zinc-900 pl-6 py-2 ml-2 italic">
                         {highlight.text}
                       </blockquote>
                       
                       <div className="mt-8 pt-4 border-t border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Ursprüngliches Datum der Quelle: <span className="text-zinc-900">{new Date(highlight.sourceDate).toLocaleDateString('de-DE')}</span></span>
                          <RelativeTimeBadge dateStr={highlight.sourceDate} />
                       </div>
                    </div>
                  ))}
                </div>
                {state.highlights.length > 3 && (
                  <div className="mt-6 text-center">
                    <button 
                      onClick={() => setActiveTab('archive')}
                      className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors underline underline-offset-4"
                    >
                      Alle {state.highlights.length} Markierungen im Archiv ansehen
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Latest Fast Scan */}
            {latestFastScan && (
              <div className="mb-12">
                 <h2 className="text-3xl font-black uppercase tracking-tight mb-8 border-b-2 border-zinc-900 pb-4">Letzter Quick Research</h2>
                 <FastScanView scan={latestFastScan} />
              </div>
            )}

            {/* Latest Report */}
            {latestReport && (
              <div>
                 <h2 className="text-3xl font-black uppercase tracking-tight mb-8 border-b-2 border-zinc-900 pb-4">Letzter Deep Research</h2>
                 <Newsletter report={latestReport} onSaveHighlight={handleSaveHighlight} />
              </div>
            )}
          </div>
        )}

        {/* Experts Tab */}
        {activeTab === 'experts' && (
          <ExpertList
            experts={state.experts}
            setExperts={handleUpdateExperts}
            reports={state.reports}
            highlights={state.highlights}
            onReset={handleResetExperts}
          />
        )}

        {/* Knowledge Base / Archive Tab */}
        {activeTab === 'archive' && (
          <div className="max-w-5xl mx-auto">
             <KnowledgeBase reports={state.reports} experts={state.experts} highlights={state.highlights} onSaveHighlight={handleSaveHighlight} />
          </div>
        )}

      </main>
    </div>
  );
}