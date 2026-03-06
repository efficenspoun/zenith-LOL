import React, { useState, useEffect, useRef } from 'react';
import { MediaPlayer, MediaProvider, Poster, Track, type MediaPlayerInstance } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import { Play, Server, Headphones, Globe, Loader2, AlertCircle, Activity, RefreshCw, Layers, Zap } from 'lucide-react';

import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import { ZENITH_API_BASE } from '../constants';

/**
 * Props for the ZenithPlayer component
 */
interface ZenithPlayerProps {
  query: string;
  episode: number;
  poster?: string;
  onComplete?: () => void;
}

/**
 * Interface for the API response
 */
interface ZenithSource {
  url: string;
  server: string;
  type: string;
  isEmbed?: boolean;
  subtitles?: { url: string; label: string }[];
}

interface ZenithApiResponse {
  status: string;
  sources: ZenithSource[];
}

const ZenithPlayer: React.FC<ZenithPlayerProps> = ({ query, episode, poster, onComplete }) => {
  // 1. State Management
  const [source, setSource] = useState<'kuudere' | 'allmanga'>('kuudere');
  const [audioType, setAudioType] = useState<'sub' | 'dub'>('sub');
  const [availableServers, setAvailableServers] = useState<ZenithSource[]>([]);
  const [activeSource, setActiveSource] = useState<ZenithSource | null>(null);
  
  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for Player and Timestamp Syncing
  const playerRef = useRef<MediaPlayerInstance>(null);
  const savedTimeRef = useRef<number>(0);

  /**
   * 2. Effect Hook: Fetch data when query, episode, source, or audioType changes
   */
  useEffect(() => {
    const fetchStreamData = async () => {
      if (!query) return;

      setIsLoading(true);
      setError(null);
      setAvailableServers([]);
      
      // We don't clear activeStreamUrl immediately to allow the player to keep showing the old stream
      // while the new one loads, or we can clear it if we want a fresh state.
      // The prompt says "auto-select the first server's URL" on success.
      
      const baseUrl = `${ZENITH_API_BASE}/anime`;
      const params = new URLSearchParams({
        query: query,
        episode: episode.toString(),
        source: source,
        type: audioType
      });
      const targetUrl = `${baseUrl}?${params.toString()}`;

      // Multi-proxy fallback strategy
      const proxies = [{
                    name: 'Direct',
                    url: (u: string) => u
                },
                {
                    name: 'Proxy A (AllOrigins Raw)',
                    url: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
                },
                {
                    name: 'Proxy B (CorsProxy.io)',
                    url: (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`
                },
                {
                    name: 'Proxy C (Codetabs)',
                    url: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
                },
                {
                    name: 'Proxy D (AllOrigins JSON)',
                    url: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
                    isJsonWrap: true
                },
                {
                    name: 'Proxy E (CORS Workers)',
                    url: (u: string) => `https://test.cors.workers.dev/?${encodeURIComponent(u)}`
                }, {
                    name: "Proxy F (Corsfix)",
                    url: (u: string) => `https://proxy.corsfix.com/?${encodeURIComponent(u)}`
                },
              	{
                    name: "Proxy G (Corslol)",
                    url: (u: string) => `https://cors.lol/?url=${encodeURIComponent(u)}`
                },
              	{
                    name: "Proxy H (Corsx2u)",
                    url: (u: string) => `https://cors.x2u.in/?url=${encodeURIComponent(u)}`
                },
                {
                    name: "Proxy I (thebugging)",
                    url: (u: string) => `https://www.thebugging.com/apis/cors-proxy?url=${encodeURIComponent(u)}`
                },
              	{
                    name: "Proxy J (hackeryou)",
                    url: (u: string) => `https://proxy.hackeryou.com/?url=${encodeURIComponent(u)}`
                },
                {
                    name: "Proxy K (proxyuwu)",
                    url: (u: string) => `https://proxyuwu.ilikechez87.workers.dev/?${encodeURIComponent(u)}`
                },
            ];

      let lastError: any = null;
      let success = false;

      for (const proxy of proxies) {
        try {
          console.log(`[Zenith] Fetching ${source} via ${proxy.name}...`);
          const fetchUrl = proxy.url(targetUrl);
          
          const response = await fetch(fetchUrl, {
            method: 'GET',
            credentials: 'omit',
            mode: 'cors'
          });
          
          if (!response.ok) {
            throw new Error(`Node unreachable via ${proxy.name} (Status: ${response.status})`);
          }

          let data: ZenithApiResponse;
          
          if (proxy.isJsonWrap) {
            const json = await response.json();
            if (!json.contents) throw new Error(`Empty contents from ${proxy.name}`);
            data = JSON.parse(json.contents);
          } else {
            const contentType = response.headers.get('content-type');
            if (contentType && !contentType.includes('application/json')) {
              const text = await response.text();
              if (text.trim().startsWith('<')) {
                throw new Error(`Received HTML instead of JSON from ${proxy.name}`);
              }
              data = JSON.parse(text);
            } else {
              data = await response.json();
            }
          }

          if (data.status === 'success' || (data as any).status === 'ok') {
            const rawSources = data.sources || (data as any).data?.sources || (data as any).result?.sources || (data as any).data;
            
            if (rawSources && Array.isArray(rawSources) && rawSources.length > 0) {
              const normalized: ZenithSource[] = rawSources.map((s: any) => {
                let streamUrl = s.url;
                let isEmbed = s.type === 'iframe';
                
                // Handle ALLMANGA "Default" source where url is an object
                if (typeof streamUrl === 'object' && streamUrl !== null) {
                  if (streamUrl.sources && Array.isArray(streamUrl.sources)) {
                    // It has direct mp4 sources, so it's NOT an embed even if type says iframe
                    streamUrl = streamUrl.sources[0]?.url || '';
                    isEmbed = false;
                  } else if (streamUrl.url) {
                    streamUrl = streamUrl.url;
                  }
                }
                
                return {
                  url: typeof streamUrl === 'string' ? streamUrl : '',
                  server: s.server || s.name || 'Unknown Node',
                  type: s.type || 'Unknown',
                  isEmbed: isEmbed,
                  subtitles: s.subtitles || []
                };
              }).filter(s => s.url);

              setAvailableServers(normalized);
              
              if (normalized.length > 0) {
                const firstSource = normalized[0];
                setActiveSource(firstSource);
                success = true;
                console.log(`[Zenith] Synchronization successful via ${proxy.name}`);
                break; 
              } else {
                throw new Error('Empty signal from source.');
              }
            } else if (data.status === 'success' || (data as any).status === 'ok') {
              setError(`No ${audioType} streams found for ${query} (EP ${episode}) on ${source}.`);
              success = true;
              break;
            }
          }
          
          throw new Error(data.status || (data as any).message || 'Unknown matrix error');
        } catch (err: any) {
          console.warn(`[Zenith] ${proxy.name} failed:`, typeof err === 'object' ? (err?.message || 'Unknown Error') : String(err));
          lastError = err;
        }
      }

      if (!success && !error) {
        if (lastError?.name === 'TypeError' || lastError?.message?.includes('Failed to fetch')) {
          setError('Network connection blocked. Ensure the API port is set to Public in your environment.');
        } else {
          setError(lastError?.message || 'All synchronization routes exhausted. The Zenith Matrix is offline.');
        }
      }

      setIsLoading(false);
    };

    fetchStreamData();
  }, [query, episode, source, audioType]);

  /**
   * 3. Timestamp Logic: handleServerSwitch and onCanPlay
   */
  const handleServerSwitch = (server: ZenithSource) => {
    if (playerRef.current && !activeSource?.isEmbed) {
      // Save current timestamp before switching
      savedTimeRef.current = playerRef.current.currentTime;
      console.log(`[Zenith] Saving timestamp: ${savedTimeRef.current}s`);
    }
    setActiveSource(server);
  };

  const onCanPlay = () => {
    if (playerRef.current && savedTimeRef.current > 0) {
      console.log(`[Zenith] Resuming from saved timestamp: ${savedTimeRef.current}s`);
      playerRef.current.currentTime = savedTimeRef.current;
      // We don't reset savedTimeRef immediately because multiple can-play events might fire
      // but usually one is enough. We'll reset it to 0 after a successful seek.
      savedTimeRef.current = 0;
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in duration-500">
      <style>{`
        .vds-poster {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          z-index: 10;
          transition: opacity 0.4s ease;
        }
        .vds-media-player[data-can-play] .vds-poster {
          opacity: 0;
          pointer-events: none;
        }
        .vds-media-player[data-playing] .player-backdrop {
          opacity: 0;
        }
        /* Ensure the player controls are above the backdrop */
        .vds-video-layout {
          z-index: 20;
        }
      `}</style>
      {/* 4. Vidstack Player Section */}
      <div className="relative aspect-video bg-black rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl group ring-1 ring-white/5">
        
        {/* Background Backdrop for Immersive Feel */}
        {poster && (
          <div 
            className="player-backdrop absolute inset-0 z-0 opacity-30 blur-[100px] scale-125 pointer-events-none transition-opacity duration-1000"
            style={{ backgroundImage: `url(${poster})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        )}

        {/* Loading State UI */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md space-y-6">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
              <Activity className="absolute inset-0 m-auto text-blue-500 animate-pulse" size={24} />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-400">Loading stream...</p>
              <p className="text-slate-500 text-[9px] mt-2 font-mono">SYNCHRONIZING ZENITH NODE...</p>
            </div>
          </div>
        )}

        {/* Error State UI */}
        {error && !isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/95 p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20">
              <AlertCircle className="text-red-500" size={32} />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-black text-white uppercase tracking-tighter">Signal Interrupted</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">{error}</p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              <RefreshCw size={14} />
              Re-initialize Node
            </button>
          </div>
        )}

        {/* Vidstack MediaPlayer or Iframe Embed */}
        {activeSource && !isLoading && (
          activeSource.isEmbed ? (
            <div className="w-full h-full bg-black flex flex-col">
              <iframe
                src={activeSource.url}
                className="w-full h-full border-0"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <AlertCircle size={12} className="text-amber-500" />
                  <span className="text-[8px] font-black text-white uppercase tracking-widest">Embed Mode</span>
                </div>
              </div>
            </div>
          ) : (
            <MediaPlayer
              ref={playerRef}
              title={`${query} - Episode ${episode}`}
              src={activeSource.url}
              onEnded={onComplete}
              onCanPlay={onCanPlay}
              className="w-full h-full"
              playsInline
            >
              <MediaProvider>
                <Poster
                  className="vds-poster absolute inset-0 block h-full w-full opacity-0 transition-opacity data-[visible]:opacity-100"
                  src={poster || "https://picsum.photos/seed/zenith/1280/720?blur=10"}
                  alt="Poster"
                />
                {activeSource.subtitles?.map((track, i) => (
                  <Track
                    key={track.url}
                    src={track.url}
                    label={track.label}
                    kind="subtitles"
                    lang="en"
                    default={i === 0}
                  />
                ))}
              </MediaProvider>
              <DefaultVideoLayout icons={defaultLayoutIcons} />
            </MediaPlayer>
          )
        )}

        {/* Overlay Info */}
        {!isLoading && !error && activeSource && (
          <div className="absolute top-6 left-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">{activeSource.server} Node</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. UI Elements: Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Source Toggle */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-5 rounded-3xl flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
              <Globe size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Extraction Source</p>
              <p className="text-xs font-bold text-white uppercase">{source}</p>
            </div>
          </div>
          
          <div className="flex gap-1.5 p-1 bg-black/40 rounded-2xl border border-white/10">
            {(['kuudere', 'allmanga'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  source === s 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Audio Type Toggle */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-5 rounded-3xl flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
              <Headphones size={18} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Audio Protocol</p>
              <p className="text-xs font-bold text-white uppercase">{audioType}</p>
            </div>
          </div>
          
          <div className="flex gap-1.5 p-1 bg-black/40 rounded-2xl border border-white/10">
            {(['sub', 'dub'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAudioType(t)}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  audioType === t 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Server Selector */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-5 rounded-3xl flex flex-col gap-4 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20">
              <Layers size={18} className="text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Server Matrix</p>
              <p className="text-xs font-bold text-white uppercase">{activeSource?.server || 'Awaiting Selection'}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {availableServers.length > 0 ? (
              availableServers.map((s, idx) => (
                <button
                  key={`${s.server}-${idx}`}
                  onClick={() => handleServerSwitch(s)}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                    activeSource?.url === s.url 
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20' 
                      : 'bg-black/40 border-white/10 text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {s.server}
                </button>
              ))
            ) : (
              <p className="text-[9px] text-slate-600 uppercase font-bold px-2">No servers available</p>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-6 py-2 bg-white/5 rounded-full border border-white/5">
        <div className="flex items-center gap-3">
          <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`}></div>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            {isLoading ? 'Synchronizing Node...' : 'Matrix Link Stable'}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap size={10} className="text-slate-700" />
            <span className="text-[9px] font-mono text-slate-700 uppercase">Sync: Active</span>
          </div>
          <span className="text-[9px] font-mono text-slate-700 uppercase">Engine: Vidstack Matrix</span>
        </div>
      </div>
    </div>
  );
};

export default ZenithPlayer;
