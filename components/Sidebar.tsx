import React, { useMemo } from 'react';
import { X, TrendingUp, Calendar, ExternalLink } from 'lucide-react';
import { AppState } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
}

const AI_MILESTONES = [
  { date: 'Nov 2022', title: 'ChatGPT Launch', desc: 'OpenAI veröffentlicht ChatGPT (GPT-3.5).' },
  { date: 'Mär 2023', title: 'GPT-4', desc: 'OpenAI stellt GPT-4 vor.' },
  { date: 'Nov 2023', title: 'GPT-4 Turbo & Custom GPTs', desc: 'Erstes OpenAI DevDay.' },
  { date: 'Dez 2023', title: 'Gemini 1.0', desc: 'Google veröffentlicht die Gemini-Modellfamilie.' },
  { date: 'Feb 2024', title: 'Sora & Gemini 1.5 Pro', desc: 'OpenAI zeigt Sora, Google veröffentlicht Gemini 1.5 Pro mit 1M Token Kontext.' },
  { date: 'Mär 2024', title: 'Claude 3', desc: 'Anthropic veröffentlicht die Claude 3 Familie (Opus, Sonnet, Haiku).' },
  { date: 'Mai 2024', title: 'GPT-4o', desc: 'OpenAI stellt das omnimodale GPT-4o vor.' },
  { date: 'Jun 2024', title: 'Claude 3.5 Sonnet', desc: 'Anthropic setzt neue Benchmarks.' },
  { date: 'Sep 2024', title: 'OpenAI o1', desc: 'OpenAI veröffentlicht erstes "Reasoning"-Modell.' },
  { date: 'Dez 2024', title: 'Gemini 2.0 Flash', desc: 'Google veröffentlicht Gemini 2.0 Flash.' },
  { date: 'Feb 2025', title: 'Claude 3.7 Sonnet', desc: 'Anthropic veröffentlicht Hybrid-Reasoning Modell.' },
  { date: 'Mär 2026', title: 'Aktueller Stand', desc: 'KI-Agenten und multimodale Modelle dominieren den Markt.' }
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, state }) => {
  const topSources = useMemo(() => {
    const sourceCounts: Record<string, number> = {};
    
    // Count from reports
    state.reports.forEach(report => {
      report.items.forEach(item => {
        if (item.sourceName) {
          sourceCounts[item.sourceName] = (sourceCounts[item.sourceName] || 0) + 1;
        }
      });
    });

    // Count from fast scans
    state.fastScans.forEach(scan => {
      scan.sources.forEach(source => {
        // Extract domain or use title as source name
        try {
          const url = new URL(source.uri);
          const domain = url.hostname.replace('www.', '');
          sourceCounts[domain] = (sourceCounts[domain] || 0) + 1;
        } catch {
          sourceCounts[source.title] = (sourceCounts[source.title] || 0) + 1;
        }
      });
    });

    return Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [state.reports, state.fastScans]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[200] transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`fixed top-0 left-0 h-full w-full sm:w-96 bg-white border-r-2 border-zinc-900 z-[210] transform transition-transform duration-300 ease-in-out overflow-y-auto ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 border-b-2 border-zinc-900 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-black editorial-headline uppercase tracking-tight text-zinc-900">Übersicht</h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors bg-zinc-50 hover:bg-zinc-100 border border-zinc-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-10">
          {/* Top Sources */}
          <section>
            <div className="flex items-center gap-2 mb-4 border-b-2 border-zinc-900 pb-2">
              <TrendingUp className="w-5 h-5 text-zinc-900" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-900">Top Quellen</h3>
            </div>
            
            {topSources.length > 0 ? (
              <ul className="space-y-3">
                {topSources.map(([source, count], index) => (
                  <li key={source} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-zinc-400 w-4">{index + 1}.</span>
                      <span className="font-bold text-sm text-zinc-900 truncate max-w-[180px]">{source}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-zinc-200 text-zinc-700 px-2 py-1">
                      {count} Zitate
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500 italic editorial-text">Noch keine Quellen erfasst. Starte einen Research.</p>
            )}
          </section>

          {/* AI Timeline */}
          <section>
            <div className="flex items-center justify-between mb-4 border-b-2 border-zinc-900 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-zinc-900" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-900">KI-Meilensteine</h3>
              </div>
              <span className="text-[9px] uppercase tracking-widest text-zinc-400">Seit 2022</span>
            </div>
            
            <div className="relative border-l-2 border-zinc-200 ml-2 space-y-6 pb-4">
              {AI_MILESTONES.map((milestone, index) => (
                <div key={index} className="relative pl-6">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 bg-zinc-900 rounded-full" />
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{milestone.date}</div>
                  <div className="font-bold text-sm text-zinc-900 mb-1">{milestone.title}</div>
                  <div className="text-xs text-zinc-600 editorial-text">{milestone.desc}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[10px] text-zinc-400 text-center uppercase tracking-widest">
              Zuletzt aktualisiert: März 2026
            </div>
          </section>
        </div>
      </div>
    </>
  );
};
