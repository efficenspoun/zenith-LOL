
import React, { useRef, useMemo } from 'react';
import { MediaPlayer, MediaProvider, Poster } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import Hls from 'hls.js';
import { SourceResult, SourceType } from '../types';

interface PlayerProps {
  source: SourceResult;
  title: string;
  poster?: string;
  onProgress?: (percent: number) => void;
  onComplete?: () => void;
}

const Player: React.FC<PlayerProps> = ({ source, title, poster, onProgress, onComplete }) => {
  const playerRef = useRef<any>(null);

  const hlsConfig = useMemo(() => {
    if (!Hls.isSupported()) return {};

    return {
      fetchSetup: (url: string, init: RequestInit) => {
        // Direct fetch without CORS proxy
        return new Request(url, init);
      },
      xhrSetup: (xhr: XMLHttpRequest, url: string) => {
        if (url.includes('.key')) xhr.withCredentials = false;
      },
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 60,
    };
  }, [source.url, source.keyUrl]);

  const handleTimeUpdate = (event: any) => {
    if (!event?.detail) return;
    const { currentTime, duration } = event.detail;
    if (duration > 0) {
      const percent = (currentTime / duration) * 100;
      onProgress?.(percent);
      if (percent >= 98) onComplete?.();
    }
  };

  if (source.type === SourceType.EMBED) {
    return (
      <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5">
        <iframe 
          src={source.url} 
          className="w-full h-full border-0" 
          allowFullScreen 
          referrerPolicy="no-referrer" 
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden shadow-2xl group border border-white/5 transition-all">
      <div className="absolute top-5 right-5 z-40 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 pointer-events-none">
        <div className={`w-1.5 h-1.5 rounded-full ${source.keyUrl ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
        {source.provider} • {source.category}
      </div>

      <MediaPlayer
        ref={playerRef}
        title={title}
        src={source.url}
        onTimeUpdate={handleTimeUpdate}
        crossOrigin
        playsInline
        className="w-full h-full"
      >
        <MediaProvider {...({ hlsConfig } as any)}>
          {poster && <Poster src={poster} alt={title} className="vds-poster" />}
        </MediaProvider>
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>

      <style>{`
        .vds-poster {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.15;
          filter: blur(50px);
          transition: opacity 0.5s ease;
        }
        .vds-media-player[data-can-play] .vds-poster {
          opacity: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
};

export default Player;
