import React from 'react';
import { Clock } from 'lucide-react';

export const RelativeTimeBadge: React.FC<{ dateStr: string }> = ({ dateStr }) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let text = '';
  let colorClass = '';

  if (diffDays === 0) {
    text = 'Heute';
    colorClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  } else if (diffDays === 1) {
    text = 'Gestern';
    colorClass = 'bg-amber-100 text-amber-800 border-amber-200';
  } else if (diffDays < 7) {
    text = `Vor ${diffDays} Tagen`;
    colorClass = 'bg-zinc-100 text-zinc-800 border-zinc-300';
  } else if (diffDays < 14) {
    text = 'Vor 1 Woche';
    colorClass = 'bg-zinc-100 text-zinc-600 border-zinc-200';
  } else if (diffDays < 30) {
    text = `Vor ${Math.floor(diffDays / 7)} Wochen`;
    colorClass = 'bg-zinc-50 text-zinc-500 border-zinc-200';
  } else if (diffDays < 60) {
    text = 'Vor 1 Monat';
    colorClass = 'bg-zinc-50 text-zinc-400 border-zinc-200';
  } else if (diffDays < 365) {
    text = `Vor ${Math.floor(diffDays / 30)} Monaten`;
    colorClass = 'bg-zinc-50 text-zinc-400 border-zinc-200';
  } else if (diffDays < 730) {
    text = 'Vor 1 Jahr';
    colorClass = 'bg-zinc-50 text-zinc-400 border-zinc-200';
  } else {
    text = `Vor ${Math.floor(diffDays / 365)} Jahren`;
    colorClass = 'bg-zinc-50 text-zinc-400 border-zinc-200';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border ${colorClass}`}>
      <Clock className="w-3 h-3" />
      {text}
    </span>
  );
};
