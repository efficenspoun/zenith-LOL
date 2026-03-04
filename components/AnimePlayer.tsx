
import React, { useState, useMemo } from 'react';
import { MediaPlayer, MediaProvider, Poster, Track } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import Hls from 'hls.js';
import { SourceResult, SourceType } from '../types';

interface AnimePlayerProps {
  sources: SourceResult[];
  title: string;
  poster?: string;
  onProgress?: (percent: number) => void;
  onComplete?: () => void;
}

function resolveSourceUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('/apivtwo/')) {
    return `https://allanime.day${url}`;
  }
  return url;
}

const AnimePlayer: React.FC<AnimePlayerProps> = ({ sources, title, poster, onProgress, onComplete }) => {
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const activeSource = sources[activeSourceIndex] || sources[0];
  const resolvedUrl = useMemo(() => resolveSourceUrl(activeSource?.url), [activeSource]);

  const hlsConfig = useMemo(() => {
    if (!Hls.isSupported()) return {};
    
    const proxyBase = 'https://test.cors.workers.dev/?';
    
    return {
      fetchSetup: (url: string, init: RequestInit) => {
        // Proxy HLS manifest, segments and keys
        if (url.includes('.m3u8') || url.includes('.ts') || url.includes('.key') || url.includes('.txt') || url.includes('.urlset')) {
          return new Request(proxyBase + encodeURIComponent(url), init);
        }
        return new Request(url, init);
      },
      xhrSetup: (xhr: XMLHttpRequest, url: string) => {
        xhr.withCredentials = false;
      },
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
    };
  }, [activeSource]);

  const handleTimeUpdate = (event: any) => {
    if (!event?.detail) return;
    const { currentTime, duration } = event.detail;
    if (duration > 0) {
      const percent = (currentTime / duration) * 100;
      onProgress?.(percent);
      if (percent >= 98) onComplete?.();
    }
  };

  const getServerLabel = (name: string) => {
    const n = name.toLowerCase();
    if (n === 'default') return { text: 'Default', experimental: true };
    if (n.includes('yt')) return { text: 'Yt-mp4', experimental: false };
    if (n.includes('s-mp4')) return { text: 'S-mp4', experimental: false };
    if (n.includes('ok')) return { text: 'Ok', experimental: false };
    return { text: name, experimental: false };
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] relative aspect-video bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-white/5">
          {activeSource?.type === SourceType.EMBED ? (
            <div className="w-full h-full bg-black flex flex-col">
              <div className="flex-1">
                <iframe
                  src={resolvedUrl}
                  className="w-full h-full border-0"
                  allowFullScreen
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="bg-zinc-900 px-4 py-2 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                  Embedded Stream ({activeSource.pluginName})
                </span>
                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-tighter">
                  Limited Control Set
                </span>
              </div>
            </div>
          ) : (
            <MediaPlayer
              title={title}
              src={resolvedUrl}
              onTimeUpdate={handleTimeUpdate}
              onProviderSetup={(provider) => {
                if (provider.type === 'hls') {
                  (provider as any).config = hlsConfig;
                }
              }}
              crossOrigin
              playsInline
              className="w-full h-full"
            >
              <MediaProvider>
                {poster && <Poster src={poster} alt={title} className="vds-poster" />}
                {activeSource?.subtitles?.map((track, i) => {
                  const proxyBase = 'https://test.cors.workers.dev/?';
                  const proxiedUrl = track.url.startsWith('http') ? proxyBase + encodeURIComponent(track.url) : track.url;
                  return (
                    <Track
                      key={track.url}
                      src={proxiedUrl}
                      label={track.label}
                      kind="subtitles"
                      lang="en"
                      default={i === 0}
                    />
                  );
                })}
              </MediaProvider>
              <DefaultVideoLayout icons={defaultLayoutIcons} />
            </MediaPlayer>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-white/5 p-5 h-full">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-6 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
              Server Selection
            </h3>
            
            <div className="grid grid-cols-1 gap-2 overflow-y-auto max-h-[300px] lg:max-h-none custom-scrollbar pr-2">
              {sources.map((source, index) => {
                const labelInfo = getServerLabel(source.pluginName);
                const isActive = activeSourceIndex === index;
                
                return (
                  <button
                    key={index}
                    onClick={() => setActiveSourceIndex(index)}
                    className={`group w-full flex items-center justify-between p-4 rounded-xl transition-all border ${
                      isActive 
                        ? 'bg-blue-600/10 border-blue-500/50 shadow-lg' 
                        : 'bg-zinc-800/40 border-transparent hover:bg-zinc-800 hover:border-white/10'
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className={`text-[11px] font-black uppercase tracking-widest ${isActive ? 'text-blue-400' : 'text-zinc-300'}`}>
                        {labelInfo.text}
                      </span>
                      <span className="text-[9px] text-zinc-600 font-bold uppercase">
                        {source.type === SourceType.EMBED ? 'Iframe' : 'Native'}
                      </span>
                    </div>
                    {labelInfo.experimental && (
                      <span className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-black uppercase">
                        Exp
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

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

export default AnimePlayer;
