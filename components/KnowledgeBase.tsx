import React, { useState, useMemo } from 'react';
import { Report, Expert, LinkStatus, Highlight } from '../types';
import { Search, Filter, Calendar, ExternalLink, FileText, User, ChevronDown, TrendingUp, Tag, Lock, AlertTriangle, Clock, Sparkles, Send, Bookmark } from 'lucide-react';
import { askAssistant, AssistantResponse, ChatMessage } from '../services/geminiService';
import Markdown from 'react-markdown';
import { Newsletter } from './Newsletter';
import { RelativeTimeBadge } from './RelativeTimeBadge';

interface KnowledgeBaseProps {
  reports: Report[];
  experts: Expert[];
  highlights?: Highlight[];
  onSaveHighlight?: (highlight: Highlight) => void;
}

type ViewMode = 'insights' | 'strategy' | 'highlights' | 'reports';

const StatusIcon: React.FC<{ status?: LinkStatus }> = ({ status }) => {
  if (status === 'paywall') return <span title="Wahrscheinlich Paywall"><Lock className="w-3 h-3 text-amber-500" /></span>;
  if (status === 'warning') return <span title="Link nicht verifizierbar"><AlertTriangle className="w-3 h-3 text-red-500" /></span>;
  return null;
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ reports, experts, highlights = [], onSaveHighlight }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExpertId, setSelectedExpertId] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('insights');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  
  // Chat state
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<(ChatMessage & { sources?: { title: string; uri: string }[] })[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  // Flatten and process data
  const { allItems, allStrategies, allTags } = useMemo(() => {
    const items = reports.flatMap(report => 
      report.items.map(item => ({ ...item, reportTitle: report.title }))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const strategies = reports.flatMap(report => 
      report.actionSteps.map(step => ({ 
        text: step, 
        date: report.createdAt, 
        reportTitle: report.title,
        reportId: report.id
      }))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Extract unique tags and sort them
    const tags = Array.from(new Set(items.flatMap(item => item.tags || []))).sort();

    return { allItems: items, allStrategies: strategies, allTags: tags };
  }, [reports]);

  // Filter Helper
  const matchesTimeRange = (dateStr: string) => {
    if (timeRange === 'all') return true;
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    switch(timeRange) {
        case '30d': return diffDays <= 30;
        case '90d': return diffDays <= 90;
        case '180d': return diffDays <= 180;
        case '365d': return diffDays <= 365;
        default: return true;
    }
  };

  // Filter Logic
  const filteredItems = allItems.filter(item => {
    const matchesSearch = 
      item.headline.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.summary.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesExpert = true;
    if (selectedExpertId !== 'all') {
      const expert = experts.find(e => e.id === selectedExpertId);
      if (expert) {
        matchesExpert = item.expertName.toLowerCase().includes(expert.name.toLowerCase());
      }
    }

    let matchesTag = true;
    if (selectedTag !== 'all') {
      matchesTag = item.tags ? item.tags.includes(selectedTag) : false;
    }

    return matchesSearch && matchesExpert && matchesTag && matchesTimeRange(item.date);
  });

  const filteredStrategies = allStrategies.filter(step => 
    step.text.toLowerCase().includes(searchTerm.toLowerCase()) && matchesTimeRange(step.date)
  );

  const filteredHighlights = highlights.filter(highlight => {
    const matchesSearch = 
      highlight.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
      highlight.expertName.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesExpert = true;
    if (selectedExpertId !== 'all') {
      const expert = experts.find(e => e.id === selectedExpertId);
      if (expert) {
        matchesExpert = highlight.expertName.toLowerCase().includes(expert.name.toLowerCase());
      }
    }

    return matchesSearch && matchesExpert && matchesTimeRange(highlight.sourceDate);
  }).sort((a, b) => new Date(b.highlightDate).getTime() - new Date(a.highlightDate).getTime());

  const filteredReports = reports.filter(report => {
    const matchesSearch = 
      report.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      report.intro.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesExpert = true;
    if (selectedExpertId !== 'all') {
      const expert = experts.find(e => e.id === selectedExpertId);
      if (expert) {
        matchesExpert = report.items.some(item => item.expertName.toLowerCase().includes(expert.name.toLowerCase()));
      }
    }

    let matchesTag = true;
    if (selectedTag !== 'all') {
      matchesTag = report.items.some(item => item.tags && item.tags.includes(selectedTag));
    }

    return matchesSearch && matchesExpert && matchesTag && matchesTimeRange(report.createdAt);
  });

  const handleAskAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim()) return;
    
    const userQuery = chatQuery;
    setChatQuery('');
    setIsChatting(true);
    
    const newHistory = [...chatHistory, { role: 'user' as const, parts: [{ text: userQuery }] }];
    setChatHistory(newHistory);
    
    try {
        const response = await askAssistant(userQuery, reports, chatHistory);
        setChatHistory([...newHistory, { 
          role: 'model' as const, 
          parts: [{ text: response.text }],
          sources: response.sources
        }]);
    } catch (err) {
        setChatHistory([...newHistory, { 
          role: 'model' as const, 
          parts: [{ text: "Entschuldigung, ich konnte die Anfrage momentan nicht verarbeiten." }],
          sources: []
        }]);
    } finally {
        setIsChatting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="border-b-2 border-zinc-900 pb-6 mb-8">
        <h2 className="text-4xl md:text-5xl editorial-headline font-black text-zinc-900 uppercase tracking-tight">
          Wissensdatenbank
        </h2>
        <p className="editorial-text text-zinc-600 mt-4 text-xl italic">
          Durchsuche {allItems.length} Einträge, {allStrategies.length} Strategie-Impulse und {highlights.length} Markierungen aus deiner Historie.
        </p>
      </div>
      
      {/* AI Assistant Section */}
      <div className="bg-zinc-50 rounded-none p-6 md:p-10 border-2 border-zinc-900 relative overflow-hidden mb-12">
        <div className="flex items-start gap-6 relative z-10">
            <div className="bg-zinc-900 p-3 rounded-full text-white shadow-sm flex-shrink-0 mt-1">
                <Sparkles className="w-6 h-6" />
            </div>
            <div className="flex-1">
                <h3 className="text-2xl editorial-headline font-black mb-3 text-zinc-900 uppercase tracking-tight">Frag deinen AI Scout</h3>
                <p className="editorial-text text-zinc-700 text-lg mb-8 max-w-3xl italic">
                    Stelle komplexe Fragen zu deinen gespeicherten Reports. Der Assistent nutzt Deep Thinking, um tiefgründige Zusammenhänge in deinem Archiv zu analysieren.
                </p>
                
                <div className="space-y-6 mb-8">
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-6 ${msg.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200'} animate-in fade-in slide-in-from-bottom-2`}>
                                <div className={`editorial-text text-base leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-zinc-800 prose prose-zinc max-w-none'}`}>
                                    {msg.role === 'user' ? (
                                        msg.parts[0].text
                                    ) : (
                                        <Markdown>{msg.parts[0].text}</Markdown>
                                    )}
                                </div>
                                {msg.role === 'model' && msg.sources && msg.sources.length > 0 && (
                                  <div className="mt-6 pt-4 border-t border-zinc-200">
                                    <p className="text-xs font-bold text-zinc-500 mb-3 uppercase tracking-widest flex items-center gap-2">
                                      <ExternalLink className="w-3 h-3" />
                                      Quellen
                                    </p>
                                    <ul className="space-y-2">
                                      {msg.sources.map((source, sIdx) => (
                                        <li key={sIdx}>
                                          <a 
                                            href={source.uri} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium text-zinc-900 hover:text-zinc-600 underline decoration-zinc-300 underline-offset-4 flex items-center gap-2 transition-colors"
                                          >
                                            <span className="w-1.5 h-1.5 bg-zinc-900"></span>
                                            {source.title}
                                          </a>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <form onSubmit={handleAskAssistant} className="relative group max-w-3xl">
                    <input 
                        type="text" 
                        value={chatQuery}
                        onChange={(e) => setChatQuery(e.target.value)}
                        placeholder="z.B. Was sind die Risiken von LLMs laut den letzten Reports?" 
                        className="w-full pl-6 pr-16 py-5 rounded-none bg-white border-2 border-zinc-900 placeholder-zinc-500 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition-all font-sans text-lg"
                    />
                    <button 
                        type="submit" 
                        disabled={isChatting}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-zinc-900 text-white rounded-none hover:bg-zinc-800 transition-all disabled:opacity-50"
                    >
                        {isChatting ? <div className="w-6 h-6 border-2 border-zinc-400 border-t-white rounded-full animate-spin"></div> : <Send className="w-6 h-6" />}
                    </button>
                </form>
            </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white py-6 border-y-2 border-zinc-900 flex flex-col gap-6 sticky top-20 z-40 mb-12">
        
        {/* Row 1: Search */}
        <div className="relative w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-400 group-focus-within:text-zinc-900 transition-colors" />
          <input 
            type="text" 
            placeholder="Filtere die Liste nach Themen..." 
            className="w-full pl-14 pr-4 py-4 bg-zinc-50 border border-zinc-300 rounded-none focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-zinc-900 placeholder-zinc-500 transition-all font-sans text-lg"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Row 2: Filters & Toggles */}
        <div className="flex flex-col xl:flex-row gap-5 justify-between">
           <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
              {/* Expert Filter */}
              <div className="relative min-w-[200px] group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-zinc-900 transition-colors" />
                <select 
                  className="w-full pl-12 pr-10 py-3 bg-white border border-zinc-300 rounded-none appearance-none focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-zinc-900 font-bold uppercase tracking-widest text-xs transition-all"
                  value={selectedExpertId}
                  onChange={(e) => {
                      setSelectedExpertId(e.target.value);
                      if (e.target.value !== 'all') setViewMode('insights');
                  }}
                >
                  <option value="all">Alle Experten</option>
                  {experts.map(exp => (
                    <option key={exp.id} value={exp.id}>{exp.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              </div>

              {/* Tag Filter */}
              <div className="relative min-w-[200px] group">
                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-zinc-900 transition-colors" />
                <select 
                  className="w-full pl-12 pr-10 py-3 bg-white border border-zinc-300 rounded-none appearance-none focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-zinc-900 font-bold uppercase tracking-widest text-xs transition-all disabled:opacity-50"
                  value={selectedTag}
                  onChange={(e) => {
                      setSelectedTag(e.target.value);
                      if (e.target.value !== 'all') setViewMode('insights');
                  }}
                  disabled={allTags.length === 0}
                >
                  <option value="all">Alle Themen / Tags</option>
                  {allTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" />
              </div>

              {/* Time Range Filter */}
              <div className="relative min-w-[200px] group">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-zinc-900 transition-colors" />
                <select 
                  className="w-full pl-12 pr-10 py-3 bg-white border border-zinc-300 rounded-none appearance-none focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-zinc-900 font-bold uppercase tracking-widest text-xs transition-all"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                >
                  <option value="all">Gesamter Zeitraum</option>
                  <option value="30d">Letzte 30 Tage</option>
                  <option value="90d">Letzte 3 Monate</option>
                  <option value="180d">Letzte 6 Monate</option>
                  <option value="365d">Letztes Jahr</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" />
              </div>
           </div>

           {/* View Toggle */}
           <div className="flex bg-zinc-100 p-1 rounded-none border border-zinc-300 self-start xl:self-auto flex-wrap">
             <button 
               onClick={() => { setViewMode('insights'); setSelectedReportId(null); }}
               className={`px-6 py-2 rounded-none text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'insights' ? 'bg-zinc-900 text-white shadow-sm border border-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
             >
               News
             </button>
             <button 
               onClick={() => { setViewMode('strategy'); setSelectedReportId(null); }}
               className={`px-6 py-2 rounded-none text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'strategy' ? 'bg-zinc-900 text-white shadow-sm border border-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
             >
               Strategie
             </button>
             <button 
               onClick={() => { setViewMode('highlights'); setSelectedReportId(null); }}
               className={`px-6 py-2 rounded-none text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'highlights' ? 'bg-zinc-900 text-white shadow-sm border border-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
             >
               <Bookmark className="w-4 h-4" />
               Markierungen
               {highlights.length > 0 && (
                 <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${viewMode === 'highlights' ? 'bg-white text-zinc-900' : 'bg-zinc-200 text-zinc-700'}`}>
                   {highlights.length}
                 </span>
               )}
             </button>
             <button 
               onClick={() => { setViewMode('reports'); setSelectedReportId(null); }}
               className={`px-6 py-2 rounded-none text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'reports' ? 'bg-zinc-900 text-white shadow-sm border border-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
             >
               Berichte
             </button>
           </div>
        </div>
      </div>

      {/* Results Stream */}
      <div className="space-y-8">
        {viewMode === 'insights' ? (
           <>
             {filteredItems.length === 0 ? (
               <div className="text-center py-20 text-zinc-600 bg-white border-y-2 border-zinc-900 editorial-text text-xl italic">Keine Einträge für diese Filterkriterien gefunden.</div>
             ) : (
               filteredItems.map((item, idx) => (
                  <div key={idx} className="bg-white p-6 md:p-8 border-t-2 border-zinc-900 hover:bg-zinc-50 transition-all duration-300 group first:border-t-0">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-6 gap-4">
                       <div className="flex flex-wrap items-center gap-3">
                          <span className="font-bold text-zinc-900 text-xs uppercase tracking-widest border-b-2 border-zinc-900 pb-1">{item.expertName}</span>
                          <span className="text-zinc-300 hidden md:inline">•</span>
                          <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                             <Calendar className="w-3.5 h-3.5" />
                             {new Date(item.date).toLocaleDateString('de-DE')}
                          </span>
                          <RelativeTimeBadge dateStr={item.date} />
                       </div>
                       <div className="flex items-center gap-2">
                         <StatusIcon status={item.linkStatus} />
                         <a 
                           href={item.sourceUrl} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-colors flex items-center gap-1.5 ${item.linkStatus === 'paywall' ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100' : 'bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200'}`}
                         >
                           {item.sourceName || "Quelle"}
                           <ExternalLink className="w-3 h-3 opacity-70" />
                         </a>
                       </div>
                    </div>
                    
                    <h3 className="text-3xl md:text-4xl font-black text-zinc-900 mb-4 editorial-headline leading-tight tracking-tight">
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 transition-colors">
                        {item.headline}
                      </a>
                    </h3>
                    <div className="editorial-text text-xl text-zinc-800 leading-relaxed mb-6">
                      <p>{item.summary}</p>
                    </div>

                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-6">
                         {item.tags.map(tag => (
                           <button 
                             key={tag} 
                             onClick={() => setSelectedTag(tag)}
                             className={`px-3 py-1 text-[10px] uppercase font-bold tracking-widest transition-colors ${selectedTag === tag ? 'bg-zinc-900 text-white border border-zinc-900' : 'bg-zinc-50 text-zinc-600 border border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900'}`}
                           >
                             {tag}
                           </button>
                         ))}
                      </div>
                    )}
                    
                    <div className="text-[10px] text-zinc-400 uppercase tracking-widest pt-4 border-t border-zinc-100 mt-4 flex justify-between items-center font-bold">
                       <span className="flex items-center gap-1.5"><FileText className="w-3 h-3" /> Gefunden im Report: <span className="text-zinc-900">{item.reportTitle}</span></span>
                    </div>
                 </div>
               ))
             )}
           </>
        ) : viewMode === 'strategy' ? (
           <>
              {filteredStrategies.length === 0 ? (
                <div className="text-center py-20 text-zinc-600 bg-white border-y-2 border-zinc-900 editorial-text text-xl italic">Keine Strategie-Impulse gefunden.</div>
              ) : (
                <div className="grid gap-6">
                  {filteredStrategies.map((step, idx) => (
                    <div key={idx} className="bg-white border-t-2 border-zinc-900 p-6 md:p-8 hover:bg-zinc-50 transition-colors first:border-t-0">
                       <div className="flex flex-wrap items-center gap-3 mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            Generiert am {new Date(step.date).toLocaleDateString('de-DE')}
                          </span>
                          <RelativeTimeBadge dateStr={step.date} />
                       </div>
                       <p className="editorial-text text-zinc-900 leading-relaxed text-xl">
                         {step.text}
                       </p>
                    </div>
                  ))}
                </div>
              )}
           </>
        ) : viewMode === 'reports' ? (
           <>
              {selectedReportId ? (
                <div className="animate-in fade-in slide-in-from-bottom-4">
                  <button 
                    onClick={() => setSelectedReportId(null)}
                    className="mb-8 text-sm font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-2"
                  >
                    ← Zurück zur Übersicht
                  </button>
                  <Newsletter 
                    report={reports.find(r => r.id === selectedReportId)!} 
                    onSaveHighlight={onSaveHighlight} 
                  />
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="text-center py-20 text-zinc-600 bg-white border-y-2 border-zinc-900 editorial-text text-xl italic">Keine Berichte gefunden.</div>
              ) : (
                <div className="grid gap-6">
                  {filteredReports.map((report) => (
                    <div 
                      key={report.id} 
                      onClick={() => setSelectedReportId(report.id)}
                      className="bg-white border-2 border-zinc-900 p-6 md:p-8 hover:bg-zinc-50 transition-colors cursor-pointer group"
                    >
                       <div className="flex flex-wrap items-center gap-3 mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            Erstellt am {new Date(report.createdAt).toLocaleDateString('de-DE')}
                          </span>
                          <RelativeTimeBadge dateStr={report.createdAt} />
                       </div>
                       <h3 className="text-2xl md:text-3xl font-black text-zinc-900 mb-4 editorial-headline leading-tight tracking-tight group-hover:text-zinc-600 transition-colors">
                         {report.title}
                       </h3>
                       <p className="editorial-text text-zinc-600 leading-relaxed text-lg line-clamp-3">
                         {report.intro}
                       </p>
                       <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                         <span>{report.items.length} Insights</span>
                         <span>{report.actionSteps.length} Strategien</span>
                       </div>
                    </div>
                  ))}
                </div>
              )}
           </>
        ) : (
           <>
              {filteredHighlights.length === 0 ? (
                <div className="text-center py-20 text-zinc-600 bg-white border-y-2 border-zinc-900 editorial-text text-xl italic">Keine Markierungen gefunden. Markiere Text in einem Report, um ihn hier zu speichern.</div>
              ) : (
                <div className="grid gap-8">
                  {filteredHighlights.map((highlight) => (
                    <div key={highlight.id} className="bg-white p-6 md:p-8 border-t-2 border-zinc-900 hover:bg-zinc-50 transition-all first:border-t-0">
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
                       
                       <blockquote className="editorial-text text-2xl md:text-3xl text-zinc-900 leading-relaxed border-l-4 border-zinc-900 pl-6 py-2 ml-2 italic">
                         {highlight.text}
                       </blockquote>
                       
                       <div className="mt-8 pt-4 border-t border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Ursprüngliches Datum der Quelle: <span className="text-zinc-900">{new Date(highlight.sourceDate).toLocaleDateString('de-DE')}</span></span>
                          <RelativeTimeBadge dateStr={highlight.sourceDate} />
                       </div>
                    </div>
                  ))}
                </div>
              )}
           </>
        )}
      </div>
    </div>
  );
};