import React, { useState, useEffect, useRef } from 'react';
import { MediaPlayer, MediaProvider, Poster, type MediaPlayerInstance } from '@vidstack/react';
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
  const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(null);
  const [activeServerName, setActiveServerName] = useState<string>('');
  
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
      const proxies = [
        { name: 'Direct', url: (u: string) => u },
        { name: 'Proxy A (AllOrigins Raw)', url: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
        { name: 'Proxy B (CorsProxy.io)', url: (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}` },
        { name: 'Proxy C (Codetabs)', url: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
        { name: 'Proxy D (AllOrigins JSON)', url: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, isJsonWrap: true },
        { name: 'Proxy E (CORS Workers)', url: (u: string) => `https://test.cors.workers.dev/?${encodeURIComponent(u)}` }
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

          if (data.status === 'success' && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
            setAvailableServers(data.sources);
            
            // Auto-select the first server
            const firstSource = data.sources[0];
            if (firstSource.url) {
              // If we are changing the entire source/episode, we might want to reset savedTime
              // but the prompt says "switch between servers seamlessly", which usually implies
              // switching servers for the same episode. 
              // However, if the episode or query changes, we should probably reset the saved time.
              // For now, we'll just set the stream.
              setActiveStreamUrl(firstSource.url);
              setActiveServerName(firstSource.server || 'Unknown Node');
              success = true;
              console.log(`[Zenith] Synchronization successful via ${proxy.name}`);
              break; 
            } else {
              throw new Error('Empty signal from source.');
            }
          } else if (data.status === 'success') {
            setError(`No ${audioType} streams found for ${query} (EP ${episode}) on ${source}.`);
            success = true;
            break;
          } else {
            throw new Error(data.status || 'Unknown matrix error');
          }
        } catch (err: any) {
          console.warn(`[Zenith] ${proxy.name} failed:`, err?.message || err);
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
    if (playerRef.current) {
      // Save current timestamp before switching
      savedTimeRef.current = playerRef.current.currentTime;
      console.log(`[Zenith] Saving timestamp: ${savedTimeRef.current}s`);
    }
    setActiveStreamUrl(server.url);
    setActiveServerName(server.server);
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
      {/* 4. Vidstack Player Section */}
      <div className="relative aspect-video bg-black rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl group ring-1 ring-white/5">
        
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

        {/* Vidstack MediaPlayer */}
        {activeStreamUrl && !isLoading && (
          <MediaPlayer
            ref={playerRef}
            title={`${query} - Episode ${episode}`}
            src={activeStreamUrl}
            onEnded={onComplete}
            onCanPlay={onCanPlay}
            className="w-full h-full"
            playsInline
          >
            <MediaProvider>
              <Poster
                className="absolute inset-0 block h-full w-full rounded-md opacity-0 transition-opacity data-[visible]:opacity-100 object-cover"
                src={poster || "https://picsum.photos/seed/zenith/1280/720?blur=10"}
                alt="Poster"
              />
            </MediaProvider>
            <DefaultVideoLayout icons={defaultLayoutIcons} />
          </MediaPlayer>
        )}

        {/* Overlay Info */}
        {!isLoading && !error && activeServerName && activeStreamUrl && (
          <div className="absolute top-6 left-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">{activeServerName} Node</span>
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
              <p className="text-xs font-bold text-white uppercase">{activeServerName || 'Awaiting Selection'}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {availableServers.length > 0 ? (
              availableServers.map((s, idx) => (
                <button
                  key={`${s.server}-${idx}`}
                  onClick={() => handleServerSwitch(s)}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                    activeStreamUrl === s.url 
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
