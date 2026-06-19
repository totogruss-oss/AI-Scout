import React, { useRef, useState, useEffect } from 'react';
import { Report, LinkStatus, ReportItem, Highlight } from '../types';
import { Share2, Copy, Calendar, Newspaper, Youtube, FileText, MessageSquare, Mic, Link as LinkIcon, Lock, AlertTriangle, Download, Loader2, Volume2, Play, Pause, Square, Volume1, VolumeX, BookmarkPlus } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { getReportAudioUrl } from '../services/geminiService';

interface NewsletterProps {
  report: Report;
  onSaveHighlight?: (highlight: Highlight) => void;
}

const getSourceIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'video/youtube':
    case 'video':
      return <Youtube className="w-3 h-3" />;
    case 'podcast':
      return <Mic className="w-3 h-3" />;
    case 'paper':
      return <FileText className="w-3 h-3" />;
    case 'twitter/x':
    case 'linkedin':
      return <MessageSquare className="w-3 h-3" />;
    default:
      return <Newspaper className="w-3 h-3" />;
  }
};

const ValidationBadge: React.FC<{ status?: LinkStatus }> = ({ status }) => {
  if (status === 'paywall') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200" title="Diese Quelle erfordert möglicherweise ein kostenpflichtiges Abonnement.">
        <Lock className="w-3 h-3" />
        PAYWALL MÖGLICH
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100" title="Dieser Link konnte nicht erreicht werden (z.B. 404 Fehler).">
        <AlertTriangle className="w-3 h-3" />
        NICHT ERREICHBAR
      </span>
    );
  }
  if (status === 'accessible') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100" title="Dieser Link wurde erfolgreich auf Erreichbarkeit geprüft.">
        <LinkIcon className="w-3 h-3" />
        VERIFIZIERT
      </span>
    );
  }
  return null;
};

// Helper for time formatting
const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const Newsletter: React.FC<NewsletterProps> = ({ report, onSaveHighlight }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('Fenrir');
  
  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Highlight State
  const [selection, setSelection] = useState<{ text: string, x: number, y: number, item: ReportItem | null } | null>(null);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      // Small delay to allow click on the button itself to register
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
          setSelection(null);
        }
      }, 100);
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const handleArticleMouseUp = (e: React.MouseEvent, item: ReportItem) => {
    e.stopPropagation(); // Prevent global from clearing immediately
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    
    if (text && text.length > 0 && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      setSelection({
        text,
        x: rect.left + (rect.width / 2),
        y: rect.top + window.scrollY - 40, // Position above the selection
        item
      });
    } else {
      setSelection(null);
    }
  };

  const saveHighlight = () => {
    if (selection && selection.item && onSaveHighlight) {
      onSaveHighlight({
        id: crypto.randomUUID(),
        text: selection.text,
        expertName: selection.item.expertName,
        sourceUrl: selection.item.sourceUrl,
        sourceName: selection.item.sourceName,
        sourceDate: selection.item.date,
        highlightDate: new Date().toISOString()
      });
      alert("Markierung gespeichert!");
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  useEffect(() => {
    // Cleanup URL on unmount
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const copyToClipboard = () => {
    if (contentRef.current) {
      const html = contentRef.current.innerHTML;
      const blob = new Blob([html], { type: 'text/html' });
      const item = new ClipboardItem({ 'text/html': blob });
      navigator.clipboard.write([item]).then(() => {
        alert("Newsletter HTML kopiert!");
      });
    }
  };

  const handleMailTo = () => {
    const subject = encodeURIComponent(report.title);
    const body = encodeURIComponent(`KI Update:\n\n${report.intro}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleInitializeAudio = async () => {
    if (audioUrl) return; // Already generated
    
    setIsGeneratingAudio(true);
    try {
        const url = await getReportAudioUrl(report, selectedVoice);
        setAudioUrl(url);
        // Auto play after generation
        setTimeout(() => {
            if (audioRef.current) {
                audioRef.current.play();
                setIsPlaying(true);
            }
        }, 100);
    } catch (e) {
        console.error(e);
        alert("Fehler bei der Audio-Generierung. Möglicherweise ist der Text zu lang für eine einzelne Anfrage.");
    } finally {
        setIsGeneratingAudio(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const vol = parseFloat(e.target.value);
    audioRef.current.volume = vol;
    setVolume(vol);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      if (isFinite(dur)) {
        setDuration(dur);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleExportPDF = async () => {
    if (!contentRef.current) return;
    
    setIsExporting(true);
    try {
      const element = contentRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgPropsWidth = pdfWidth;
      const imgPropsHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const doc = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgPropsHeight;
      let position = 0;

      doc.addImage(imgData, 'PNG', 0, position, imgPropsWidth, imgPropsHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgPropsHeight;
        doc.addPage();
        doc.addImage(imgData, 'PNG', 0, position, imgPropsWidth, imgPropsHeight);
        heightLeft -= pdfHeight;
      }

      const dateStr = new Date(report.createdAt).toISOString().split('T')[0];
      doc.save(`AI-Scout-Report_${dateStr}.pdf`);
    } catch (error) {
      console.error("PDF Export failed:", error);
      alert("Der PDF Export ist fehlgeschlagen.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 overflow-hidden">
      {/* Hidden Audio Element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}

      {/* Highlight Button Overlay */}
      {selection && (
        <div 
          className="absolute z-50 animate-in fade-in zoom-in duration-200"
          style={{ 
            left: `${selection.x}px`, 
            top: `${selection.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <button 
            onClick={saveHighlight}
            className="flex items-center gap-2 bg-zinc-900 text-white px-3 py-2 rounded-none shadow-xl hover:bg-zinc-800 transition-colors text-sm font-bold border border-zinc-700"
          >
            <BookmarkPlus className="w-4 h-4" />
            Markierung speichern
          </button>
          <div className="w-3 h-3 bg-zinc-900 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b border-zinc-700"></div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-zinc-50 border-b border-zinc-200 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-zinc-500 text-sm font-bold uppercase tracking-widest">
          <Calendar className="w-4 h-4" />
          {new Date(report.createdAt).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
        
        <div className="flex flex-wrap items-center gap-4 justify-center md:justify-end w-full md:w-auto">
          {/* Audio Player Controls */}
          <div className="flex items-center border border-zinc-300 bg-white p-1.5 gap-2 min-h-[40px]">
            {!audioUrl ? (
                // Initial State: Voice Selector + Generate Button
                isGeneratingAudio ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-1 text-sm font-bold text-zinc-900 w-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generiere Audio...</span>
                    </div>
                ) : (
                    <>
                        <select 
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="bg-transparent text-xs font-bold text-zinc-600 py-1 pl-1 pr-1 focus:outline-none cursor-pointer border-none"
                        >
                        <option value="Fenrir">Fenrir (Tief)</option>
                        <option value="Charon">Charon (Tief)</option>
                        <option value="Puck">Puck (Mittel)</option>
                        <option value="Kore">Kore (Weiblich)</option>
                        <option value="Zephyr">Zephyr (Weiblich)</option>
                        </select>
                        <button 
                        onClick={handleInitializeAudio}
                        className="flex items-center gap-1.5 px-3 py-1 text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
                        >
                        <Play className="w-4 h-4 fill-current" />
                        Vorlesen
                        </button>
                    </>
                )
            ) : (
                // Player UI State
                <div className="flex items-center gap-3 px-1">
                    {/* Play/Pause */}
                    <button onClick={togglePlay} className="p-1.5 bg-zinc-900 text-white hover:bg-zinc-800 transition" title={isPlaying ? "Pause" : "Abspielen"}>
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </button>
                    
                    {/* Stop */}
                    <button onClick={handleStop} className="p-1.5 text-zinc-600 hover:bg-zinc-100 transition" title="Stoppen">
                        <Square className="w-4 h-4 fill-current" />
                    </button>

                    {/* Progress Bar & Time */}
                    <div className="flex flex-col w-32 sm:w-48 gap-1">
                        <input
                            type="range"
                            min="0"
                            max={isFinite(duration) && duration > 0 ? duration : 100}
                            step="0.1"
                            value={isFinite(duration) && duration > 0 ? currentTime : 0}
                            onChange={handleSeek}
                            disabled={!isFinite(duration) || duration <= 0}
                            className="w-full h-1.5 bg-zinc-200 appearance-none cursor-pointer accent-zinc-900 disabled:opacity-50"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Volume Control */}
                    <div className="flex items-center gap-1 group relative">
                        <button 
                            onClick={() => {
                                if (!audioRef.current) return;
                                const newVol = volume === 0 ? 1 : 0;
                                audioRef.current.volume = newVol;
                                setVolume(newVol);
                            }}
                            className="text-zinc-600 hover:text-zinc-900 transition-colors p-1 hover:bg-zinc-100"
                            title={volume === 0 ? "Stummschaltung aufheben" : "Stummschalten"}
                        >
                            {volume === 0 ? <VolumeX className="w-4 h-4" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="w-16 h-1.5 bg-zinc-200 appearance-none cursor-pointer accent-zinc-900"
                            title={`Lautstärke: ${Math.round(volume * 100)}%`}
                        />
                    </div>
                </div>
            )}
          </div>

          <div className="h-6 w-px bg-zinc-300 hidden md:block"></div>

          <div className="flex gap-2">
            <button 
                onClick={handleExportPDF} 
                disabled={isExporting}
                className="p-2 text-zinc-600 bg-white border border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-50"
                title="Als PDF speichern"
            >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
            <button onClick={copyToClipboard} className="p-2 text-zinc-600 bg-white border border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 transition-colors" title="HTML Kopieren">
                <Copy className="w-4 h-4" />
            </button>
            <button onClick={handleMailTo} className="p-2 text-zinc-600 bg-white border border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 transition-colors" title="Per E-Mail teilen">
                <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="bg-white">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center border-b-2 border-zinc-900 mb-12">
            <span className="inline-block text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">Künstliche Intelligenz</span>
            <h1 className="text-5xl md:text-7xl font-black text-zinc-900 editorial-headline tracking-tight leading-none mb-8 uppercase">
              {report.title}
            </h1>
            <p className="editorial-text text-xl md:text-2xl leading-relaxed text-zinc-700 max-w-3xl mx-auto italic">
              {report.intro}
            </p>
        </div>

        <div className="max-w-4xl mx-auto px-4 pb-16">
          <div className="space-y-16">
            {/* Main News Items */}
            <section>
              <div className="space-y-12">
                {report.items.map((item, idx) => (
                  <article 
                    key={idx} 
                    className="relative group border-t-2 border-zinc-900 pt-10 mt-10 first:border-t-0 first:pt-0 first:mt-0"
                    onMouseUp={(e) => handleArticleMouseUp(e, item)}
                  >
                    <div className="flex flex-col md:flex-row gap-8">
                      {/* Meta sidebar */}
                      <div className="md:w-1/4 flex-shrink-0">
                        <div className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-3 border-b-2 border-zinc-900 pb-2 inline-block">
                          {item.expertName}
                        </div>
                        <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-4 flex flex-col gap-2">
                          <span>{new Date(item.date).toLocaleDateString('de-DE')}</span>
                          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900 flex items-center gap-1.5 transition-colors">
                            {getSourceIcon(item.sourceType)}
                            {item.sourceName || "Quelle"}
                          </a>
                          <div className="mt-2">
                            <ValidationBadge status={item.linkStatus} />
                          </div>
                        </div>
                      </div>
                      
                      {/* Content */}
                      <div className="md:w-3/4">
                        <h3 className="text-3xl md:text-4xl font-black text-zinc-900 mb-4 editorial-headline leading-tight tracking-tight">
                          <a href={item.sourceUrl || '#'} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 transition-colors">
                            {item.headline}
                          </a>
                        </h3>
                        <div className="editorial-text text-xl leading-relaxed text-zinc-800">
                          <p>{item.summary}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* Strategic Action Steps */}
            {report.actionSteps.length > 0 && (
              <section className="bg-zinc-50 p-8 md:p-12 border-2 border-zinc-900 mt-16">
                <h2 className="text-3xl md:text-4xl editorial-headline font-black text-zinc-900 mb-8 pb-4 border-b-2 border-zinc-900 uppercase tracking-tight">
                  Impulse für Schulleitung & IT
                </h2>
                <ul className="space-y-8">
                  {report.actionSteps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-6">
                      <span className="flex-shrink-0 w-10 h-10 bg-zinc-900 text-white flex items-center justify-center font-bold text-lg rounded-full">
                        {idx + 1}
                      </span>
                      <span className="editorial-text text-xl text-zinc-800 leading-relaxed pt-1">{step}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-zinc-200 flex flex-col items-center gap-2 pb-8">
           <div className="text-zinc-500 text-xs uppercase tracking-widest font-bold">
            AI Scout Agent • Recherche für Bildung & Führung
          </div>
          <div className="text-zinc-400 text-[10px] text-center max-w-lg">
            Quellen werden automatisch auf Paywalls geprüft. Gelbe Markierungen deuten auf kostenpflichtige Inhalte hin.
          </div>
        </div>
      </div>
    </div>
  );
};