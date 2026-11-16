import React from 'react';
import { ShieldCheck, ShieldQuestion, ShieldAlert } from 'lucide-react';
import { Attribution, ReportQuality, Verification } from '../types';

const LEVELS: Record<Verification, { label: string; hint: string; style: string; Icon: typeof ShieldCheck }> = {
  belegt: {
    label: 'Quelle belegt',
    hint: 'Die Websuche stützt genau diesen Eintrag – mit einem Treffer von derselben Website wie der Link.',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Icon: ShieldCheck,
  },
  teilweise: {
    label: 'Teilweise belegt',
    hint: 'Die Websuche stützt den Eintrag nur über eine andere Website, oder die Website des Links kam zwar in der Suche vor, aber nicht zu diesem Eintrag. Vor dem Weitergeben prüfen.',
    style: 'bg-amber-50 text-amber-700 border-amber-200',
    Icon: ShieldQuestion,
  },
  unbelegt: {
    label: 'Unbelegt',
    hint: 'Kein Suchtreffer stützt diesen Eintrag. Link und Zuschreibung können falsch sein – nicht ungeprüft verwenden.',
    style: 'bg-red-50 text-red-700 border-red-200',
    Icon: ShieldAlert,
  },
};

/** Zeigt, wie gut ein Eintrag durch die Websuche gestützt ist. Ältere Berichte ohne Prüfung zeigen nichts. */
export const VerificationBadge: React.FC<{ level?: Verification; compact?: boolean }> = ({ level, compact }) => {
  if (!level) return null;
  const { label, hint, style, Icon } = LEVELS[level];
  if (compact) {
    return <span title={`${label}: ${hint}`} className={`inline-flex p-1 border ${style}`}><Icon className="w-3 h-3" /></span>;
  }
  return (
    <span title={hint} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase border ${style}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

const ATTRIBUTION_LABELS: Record<Attribution, string> = {
  eigen: 'Eigener Beitrag',
  auftritt: 'Interview / Auftritt',
  bericht: 'Bericht über die Person',
};

export const attributionLabel = (attribution?: Attribution): string | null =>
  attribution ? ATTRIBUTION_LABELS[attribution] : null;

/** Datum eines Eintrags; ältere Berichte haben teils kein oder ein unlesbares Datum. */
export const formatItemDate = (raw?: string): string => {
  const date = raw ? new Date(raw) : null;
  return date && !isNaN(date.getTime()) ? date.toLocaleDateString('de-DE') : 'Datum unbekannt';
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Kurzer Prüfbericht unter der Einleitung: Was wurde gesucht, was belegt, was aussortiert? */
export const QualitySummary: React.FC<{ quality?: ReportQuality }> = ({ quality }) => {
  if (!quality) return null;
  const total = quality.belegt + quality.teilweise + quality.unbelegt;
  const dropped = quality.droppedTooOld + quality.droppedNoDate + quality.droppedOther;
  return (
    <section className="max-w-4xl mx-auto px-4 mb-12">
      <div className="border border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-700 text-left">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-900 mb-3">Prüfbericht</h2>
        <p className="leading-relaxed">
          Gesucht zu {plural(quality.searched, 'Person', 'Personen')}, Zeitraum: letzte {quality.windowDays} Tage.{' '}
          {plural(total, 'Eintrag', 'Einträge')}, davon{' '}
          <strong className="text-emerald-700">{quality.belegt} belegt</strong>,{' '}
          <strong className="text-amber-700">{quality.teilweise} teilweise belegt</strong>,{' '}
          <strong className="text-red-700">{quality.unbelegt} unbelegt</strong>.
          {dropped > 0 && (
            <> Aussortiert: {dropped} ({quality.droppedTooOld} zu alt, {quality.droppedNoDate} ohne sicheres Datum, {quality.droppedOther} nicht zuordenbar).</>
          )}
        </p>
        {quality.notChecked.length > 0 && (
          <p className="mt-3 text-red-700">
            <strong>Nicht geprüft</strong> (Suche fehlgeschlagen): {quality.notChecked.join(', ')}. Für diese Personen sagt der Bericht nichts aus.
          </p>
        )}
        {quality.withoutFindings.length > 0 && (
          <p className="mt-3 text-zinc-500">
            Ohne Fund im Zeitraum: {quality.withoutFindings.join(', ')}.
          </p>
        )}
      </div>
    </section>
  );
};
