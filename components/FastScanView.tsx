import React from 'react';
import Markdown from 'react-markdown';
import { FastScanResult } from '../types';
import { Zap, ExternalLink } from 'lucide-react';

interface FastScanViewProps {
  scan: FastScanResult;
}

export const FastScanView: React.FC<FastScanViewProps> = ({ scan }) => {
  return (
    <div className="bg-zinc-50 border-2 border-zinc-900 p-8 md:p-10 relative">
      <div className="absolute top-0 right-0 bg-zinc-900 text-white px-4 py-1 text-[10px] font-bold uppercase tracking-widest">
        Fast Scan
      </div>
      
      <div className="flex items-center gap-3 mb-6">
        <Zap className="w-6 h-6 text-zinc-900" />
        <h2 className="text-2xl md:text-3xl editorial-headline font-black text-zinc-900 uppercase tracking-tight">
          KI-News Update
        </h2>
      </div>
      
      <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-8 pb-4 border-b-2 border-zinc-900">
        {new Date(scan.createdAt).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })} Uhr
      </div>

      <div className="prose prose-zinc prose-lg max-w-none editorial-text">
        <Markdown>{scan.content}</Markdown>
      </div>

      {scan.sources.length > 0 && (
        <div className="mt-10 pt-6 border-t border-zinc-300">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Verwendete Quellen</h4>
          <ul className="flex flex-wrap gap-3">
            {scan.sources.map((source, idx) => (
              <li key={idx}>
                <a 
                  href={source.uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs bg-white border border-zinc-200 px-3 py-1.5 hover:bg-zinc-100 hover:border-zinc-300 transition-colors text-zinc-700"
                >
                  <ExternalLink className="w-3 h-3" />
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
