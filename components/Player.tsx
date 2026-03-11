
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MediaPlayer, MediaProvider, Poster, type MediaPlayerInstance } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import Hls from 'hls.js';
import { AlertCircle, RefreshCw, Loader2, ShieldCheck, Activity, Zap } from 'lucide-react';
import { SourceResult, SourceType } from '../types';

interface PlayerProps {
  source: SourceResult;
  title: string;
  poster?: string;
  onProgress?: (percent: number) => void;
  onComplete?: () => void;
}

interface PlayerStatus {
  stage: 'idle' | 'fetching' | 'decrypting' | 'buffering' | 'ready' | 'error';
  progress: number;
  message: string;
  subtext: string;
}

const Player: React.FC<PlayerProps> = ({ source, title, poster, onProgress, onComplete }) => {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const [status, setStatus] = useState<PlayerStatus>({
    stage: 'idle',
    progress: 0,
    message: 'Initializing Matrix...',
    subtext: 'Establishing secure link'
  });

  const hlsConfig = useMemo(() => {
    if (!Hls.isSupported()) return {};

    return {
      xhrSetup: (xhr: XMLHttpRequest, url: string) => {
        if (url.includes('.key')) {
          xhr.withCredentials = false;
        }
      },
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 60,
      manifestLoadingMaxRetry: 6,
      levelLoadingMaxRetry: 6,
      fragLoadingMaxRetry: 6,
      manifestLoadingRetryDelay: 1000,
      levelLoadingRetryDelay: 1000,
      fragLoadingRetryDelay: 1000,
    };
  }, []);

  const onProviderSetup = (provider: any) => {
    if (provider.type === 'hls') {
      const hls = provider.instance;

      hls.on(Hls.Events.MANIFEST_LOADING, () => {
        setStatus(prev => ({ ...prev, stage: 'fetching', message: 'Fetching Manifest...', subtext: 'Connecting to edge node' }));
      });

      hls.on(Hls.Events.MANIFEST_LOADED, () => {
        setStatus(prev => ({ ...prev, stage: 'fetching', message: 'Manifest Synchronized', subtext: 'Parsing stream data' }));
      });

      hls.on(Hls.Events.KEY_LOADING, () => {
        setStatus(prev => ({ ...prev, stage: 'decrypting', message: 'Decrypting AES-128...', subtext: 'Handshaking with key server' }));
      });

      hls.on(Hls.Events.KEY_LOADED, () => {
        setStatus(prev => ({ ...prev, stage: 'decrypting', message: 'Key Accepted', subtext: 'Stream decryption active' }));
      });

      hls.on(Hls.Events.BUFFER_APPENDING, () => {
        setStatus(prev => {
          if (prev.stage === 'ready' || prev.stage === 'error') return prev;
          return { ...prev, stage: 'buffering', message: 'Buffering Stream...', subtext: 'Filling local cache' };
        });
      });

      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          console.error('HLS Fatal Error:', typeof data === 'object' ? (data?.type || 'Unknown HLS Error') : String(data));
          setStatus({
            stage: 'error',
            progress: 0,
            message: 'Signal Interrupted',
            subtext: `Fatal ${data.type} error: ${data.details}`
          });
        }
      });
    }
  };

  const handleTimeUpdate = (event: any) => {
    if (!event?.detail) return;
    const { currentTime, duration } = event.detail;
    if (duration > 0) {
      const percent = (currentTime / duration) * 100;
      onProgress?.(percent);
      if (percent >= 98) onComplete?.();
    }
  };

  const handleCanPlay = () => {
    setStatus(prev => ({ ...prev, stage: 'ready', message: 'Ready', subtext: '' }));
  };

  const handleRetry = () => {
    setStatus({
      stage: 'idle',
      progress: 0,
      message: 'Re-initializing...',
      subtext: 'Attempting to reconnect'
    });
    // Force a re-render of the player by slightly changing the source if needed, 
    // but usually Vidstack handles src changes well.
    // Here we just reset the status and let the player try again.
  };

  if (source.type === SourceType.EMBED) {
    return (
      <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5">
        <iframe 
          src={source.url} 
          className="w-full h-full border-0" 
          allowFullScreen 
          referrerPolicy="no-referrer" 
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full bg-slate-950 rounded-[2.5rem] overflow-hidden shadow-2xl group border border-white/5 transition-all ring-1 ring-white/5">
      {/* Loading & Error Overlays */}
      {status.stage !== 'ready' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl p-8 text-center animate-in fade-in duration-500">
          {status.stage === 'error' ? (
            <div className="space-y-6 max-w-sm">
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 mx-auto">
                <AlertCircle className="text-red-500" size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">{status.message}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{status.subtext}</p>
              </div>
              <button 
                onClick={handleRetry}
                className="flex items-center gap-2 px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all mx-auto"
              >
                <RefreshCw size={14} />
                Re-initialize Node
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  {status.stage === 'decrypting' ? (
                    <ShieldCheck className="text-purple-500 animate-pulse" size={32} />
                  ) : status.stage === 'fetching' ? (
                    <Activity className="text-blue-500 animate-pulse" size={32} />
                  ) : (
                    <Zap className="text-blue-500 animate-pulse" size={32} />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-400">{status.message}</p>
                <p className="text-slate-500 text-[9px] font-mono uppercase tracking-widest">{status.subtext}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="absolute top-6 right-6 z-40 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3 pointer-events-none">
        <div className={`w-2 h-2 rounded-full ${source.keyUrl ? 'bg-purple-500' : 'bg-blue-500'} animate-pulse`}></div>
        {source.provider} • {source.category}
      </div>

      <MediaPlayer
        ref={playerRef}
        title={title}
        src={source.url}
        onTimeUpdate={handleTimeUpdate}
        onCanPlay={handleCanPlay}
        onError={() => setStatus({ stage: 'error', progress: 0, message: 'Playback Error', subtext: 'The media engine encountered a fatal error' })}
        crossOrigin
        playsInline
        className="w-full h-full"
      >
        <MediaProvider onSetup={onProviderSetup} {...({ hlsConfig } as any)}>
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
