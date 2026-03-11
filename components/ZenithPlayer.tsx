import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MediaPlayer, MediaProvider, Poster, Track, type MediaPlayerInstance } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import { Play, Server, Headphones, Globe, Loader2, AlertCircle, Activity, RefreshCw, Layers, Zap, Shield, Info, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react';
import Hls from 'hls.js';

import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import { ZENITH_API_BASE } from '../constants';

/**
 * Props for the ZenithPlayer component
 */
interface ZenithPlayerProps {
  query: string;
  alternativeQuery?: string;
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
  isVerified?: boolean;
  nodeId?: string;
  subtitles?: { url: string; label: string; srcLang?: string }[];
  thumbnails?: string;
}

interface ZenithApiResponse {
  status: string;
  sources: ZenithSource[];
}

type LoadingStage = 'fetching' | 'decrypting' | 'buffering' | 'ready' | 'idle';

const ZenithPlayer: React.FC<ZenithPlayerProps> = ({ query, alternativeQuery, episode, poster, onComplete }) => {
  // 1. State Management
  const [source, setSource] = useState<'kuudere' | 'allmanga' | 'anizone'>('kuudere');
  const [audioType, setAudioType] = useState<'sub' | 'dub'>('sub');
  const [availableServers, setAvailableServers] = useState<ZenithSource[]>([]);
  const [activeSource, setActiveSource] = useState<ZenithSource | null>(null);
  
  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('idle');
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadingText, setLoadingText] = useState('Locating source...');
  const [error, setError] = useState<string | null>(null);

  // Cycling Loading Text Effect
  useEffect(() => {
    if (!isLoading) {
      setLoadingText('Locating source...');
      return;
    }
    
    const messages = [
      "Locating source...",
      "Fetching streams...",
      "Loading player...",
      "Synchronizing nodes...",
      "Bypassing firewalls...",
      "Optimizing playback..."
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setLoadingText(messages[i]);
    }, 2500);
    
    return () => clearInterval(interval);
  }, [isLoading]);

  // Clear error whenever activeSource changes as a safety net
  useEffect(() => {
    if (activeSource) {
      setError(null);
      setLoadingStage('fetching');
      setLoadProgress(10);
    }
  }, [activeSource]);

  // Refs for Player and Timestamp Syncing
  const playerRef = useRef<MediaPlayerInstance>(null);
  const savedTimeRef = useRef<number>(0);

  /**
   * HLS Configuration for Vidstack (Essential for CORS and Encrypted Keys)
   */
  const hlsConfig = useMemo(() => {
    if (!Hls.isSupported()) return {};
    
    return {
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 60,
      maxMaxBufferLength: 600,
      // Add more robust HLS settings
      startLevel: -1,
      autoStartLoad: true,
      capLevelToPlayerSize: true,
      debug: false,
      xhrSetup: (xhr: XMLHttpRequest, url: string) => {
        xhr.withCredentials = false;
        // We can add custom headers here if needed
      }
    };
  }, [activeSource]);

  /**
   * 2. Effect Hook: Fetch data when query, episode, source, or audioType changes
   */
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchStreamData = async (searchQuery: string, isRetry: boolean = false) => {
      if (!searchQuery) return;

      if (!isRetry) {
        setIsLoading(true);
        setLoadingStage('fetching');
        setLoadProgress(20);
        setError(null);
        setAvailableServers([]);
      }
      
      // Use the base /anime path with query parameters as per user requirement
      const baseUrl = `${ZENITH_API_BASE}/anime`;
      const params = new URLSearchParams({
        query: searchQuery,
        episode: episode.toString(),
        source: source
      });
      // Only add type if it's explicitly provided
      if (audioType) {
        params.append('type', audioType);
      }
      const targetUrl = `${baseUrl}?${params.toString()}`;

      // Multi-proxy fallback strategy (Essential for CORS)
      const proxies = [
        { name: 'Direct', url: (u: string) => u },
        { name: 'Proxy A', url: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
        { name: 'Proxy B', url: (u: string) => `https://test.cors.workers.dev/?${encodeURIComponent(u)}` },
      ];

      let lastError: any = null;
      let success = false;

      for (const proxy of proxies) {
        if (signal.aborted) return;

        try {
          console.log(`[Zenith] Attempting extraction via ${proxy.name}...`);
          const response = await fetch(proxy.url(targetUrl), { signal });
          
          if (!response.ok) throw new Error(`Node unreachable via ${proxy.name} (Status: ${response.status})`);

          // Check content type before parsing as JSON
          const contentType = response.headers.get('content-type');
          let data: any;
          
          if (contentType && contentType.includes('application/json')) {
            data = await response.json();
          } else {
            const text = await response.text();
            if (text.trim().startsWith('<')) {
              throw new Error(`Received HTML instead of JSON from ${proxy.name}`);
            }
            try {
              data = JSON.parse(text);
            } catch (e) {
              throw new Error(`Failed to parse JSON from ${proxy.name}`);
            }
          }

          const rawSources = data.sources || data.data?.sources || data.result?.sources || data.data || (Array.isArray(data) ? data : null);
          
          if (rawSources && Array.isArray(rawSources) && rawSources.length > 0) {
            const seenUrls = new Set<string>();
            const normalized: ZenithSource[] = rawSources.map((s: any) => {
              let streamUrl = s.url;
              const serverName = (s.server || s.name || 'Unknown Node').toUpperCase();
              
              // Handle ALLMANGA "Default" source where url is an object
              if (typeof streamUrl === 'object' && streamUrl !== null) {
                if (streamUrl.sources && Array.isArray(streamUrl.sources)) {
                  const preferred = streamUrl.sources.find((src: any) => src.quality === '1080p') || 
                                  streamUrl.sources.find((src: any) => src.quality === '720p') || 
                                  streamUrl.sources[0];
                  streamUrl = preferred?.url || '';
                } else if (streamUrl.url) {
                  streamUrl = streamUrl.url;
                }
              }

              const urlStr = typeof streamUrl === 'string' ? streamUrl : '';
              // More robust video link detection for AllManga
              const isVideoLink = urlStr.includes('.mp4') || 
                                 urlStr.includes('.m3u8') || 
                                 urlStr.includes('.mkv') || 
                                 urlStr.includes('video.wixstatic.com') ||
                                 urlStr.includes('/hls/') ||
                                 urlStr.includes('googlevideo.com');

              let isEmbed = (s.type === 'iframe' || s.type === 'player' || s.isEmbed) && !isVideoLink;
              
      if (source === 'allmanga' && (serverName === 'DEFAULT' || serverName === 'ALLANIME')) {
                // AllManga specific parsing for direct links
                if (typeof streamUrl === 'object' && streamUrl !== null) {
                  if (streamUrl.sources && Array.isArray(streamUrl.sources)) {
                    const preferred = streamUrl.sources.find((src: any) => src.quality === '1080p') || 
                                    streamUrl.sources.find((src: any) => src.quality === '720p') || 
                                    streamUrl.sources[0];
                    streamUrl = preferred?.url || '';
                  } else if (streamUrl.url) {
                    streamUrl = streamUrl.url;
                  }
                }
                
                // If it's still an object or empty, it might be a complex structure
                if (typeof streamUrl !== 'string') {
                  streamUrl = String(streamUrl || '');
                }
                
                // AllManga direct links are often HLS but sometimes MP4
                if (streamUrl.includes('.m3u8') || streamUrl.includes('.mp4')) {
                  isEmbed = false;
                }
              }

              // Anizone Specific Parser Logic
              let processedSubtitles = s.subtitles || [];
              if (source === 'anizone') {
                // Filter out empty URLs and keep only valid links (usually .ass or .vtt)
                processedSubtitles = (s.subtitles || []).filter((sub: any) => sub.url && sub.url.trim() !== "");
              }
              
              return {
                url: urlStr,
                server: s.server || s.name || 'Unknown Node',
                type: s.type || 'Unknown',
                isEmbed: isEmbed,
                isVerified: true,
                nodeId: `ZN-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
                subtitles: processedSubtitles,
                thumbnails: s.thumbnails
              };
            }).filter(s => s.url && !seenUrls.has(s.url) && seenUrls.add(s.url));

            if (normalized.length > 0) {
              setAvailableServers(normalized);
              setError(null); // Explicitly clear error before setting active source
              setActiveSource(normalized[0]);
              success = true;
              setLoadProgress(60);
              console.log(`[Zenith] Extraction successful via ${proxy.name}`);
              break; 
            }
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            console.log(`[Zenith] Fetch aborted for ${proxy.name}`);
            return;
          }
          console.warn(`[Zenith] ${proxy.name} failed:`, err.message);
          lastError = err;
        }
      }

      if (!success && !signal.aborted) {
        if (lastError?.message?.includes('404') && alternativeQuery && searchQuery !== alternativeQuery && !isRetry) {
          return fetchStreamData(alternativeQuery, true);
        }
        setError(lastError?.message || 'The Zenith Matrix is offline.');
        setLoadingStage('idle');
      }
      
      if (!signal.aborted) {
        setIsLoading(false);
      }
    };

    fetchStreamData(query);

    return () => {
      controller.abort();
    };
  }, [query, alternativeQuery, episode, source, audioType]);

  /**
   * 3. Timestamp Logic: handleServerSwitch and onCanPlay
   */
  const handleServerSwitch = (server: ZenithSource) => {
    if (server.url === activeSource?.url) return;
    
    if (playerRef.current && !activeSource?.isEmbed) {
      // Save current timestamp before switching
      savedTimeRef.current = playerRef.current.currentTime;
      console.log(`[Zenith] Saving timestamp: ${savedTimeRef.current}s`);
    }
    setError(null); // Clear error when manually switching servers
    setLoadingStage('fetching');
    setLoadProgress(10);
    setActiveSource(server);
  };

  const onCanPlay = () => {
    setError(null); // Final clearance of any lingering errors when media is ready
    setLoadingStage('ready');
    setLoadProgress(100);
    
    if (playerRef.current && savedTimeRef.current > 0) {
      console.log(`[Zenith] Resuming from saved timestamp: ${savedTimeRef.current}s`);
      playerRef.current.currentTime = savedTimeRef.current;
      savedTimeRef.current = 0;
    }
  };

  const handlePlayerError = (event: any) => {
    // Ignore errors if we are currently loading a new batch or if no source is active
    if (isLoading || !activeSource) return;
    
    console.warn(`[Zenith] Media Error on ${activeSource.server}:`, typeof event === 'object' ? (event?.message || 'Unknown Media Error') : String(event));
    
    if (availableServers.length > 1) {
      const currentIndex = availableServers.findIndex(s => s.url === activeSource.url);
      const nextIndex = (currentIndex + 1) % availableServers.length;
      
      // If we've looped back to the start, stop trying to avoid infinite loops
      if (nextIndex === 0 && currentIndex !== -1) {
        setError("All available servers failed to load. Please try a different extraction source or audio protocol.");
        setLoadingStage('idle');
        return;
      }

      const nextSource = availableServers[nextIndex];
      handleServerSwitch(nextSource);
    } else {
      setError(`The server ${activeSource.server} failed to load and no fallback nodes are available.`);
      setLoadingStage('idle');
    }
  };

  /**
   * 4. Server Matrix Overhaul: Mapping and UI
   */
  const getServerDisplay = (name: string) => {
    const n = name.toLowerCase();
    
    // AllManga specific mappings
    if (n === 'default' || n === 'allanime') return { label: 'Zenith Prime', icon: <Zap size={10} />, color: 'text-blue-400', glow: 'shadow-blue-500/20' };
    
    // Anizone specific mappings
    if (n === 'vid-cdn') return { label: 'Anizone Edge', icon: <Activity size={10} />, color: 'text-orange-400', glow: 'shadow-orange-500/20' };
    
    if (n === 'yt') return { label: 'Nexus MP4', icon: <Activity size={10} />, color: 'text-emerald-400', glow: 'shadow-emerald-500/20' };
    if (n === 's-mp4') return { label: 'Shadow Stream', icon: <Layers size={10} />, color: 'text-purple-400', glow: 'shadow-purple-500/20' };
    if (n === 'ok') return { label: 'Omega Node', icon: <Globe size={10} />, color: 'text-cyan-400', glow: 'shadow-cyan-500/20' };
    if (n === 'uv-mp4') return { label: 'Ultra Violet', icon: <Zap size={10} />, color: 'text-violet-400', glow: 'shadow-violet-500/20' };
    
    // Generic mappings
    if (n.includes('vidstreaming')) return { label: 'VidStream', icon: <Activity size={10} />, color: 'text-blue-400', glow: 'shadow-blue-500/20' };
    if (n.includes('gogo')) return { label: 'GogoNode', icon: <Zap size={10} />, color: 'text-yellow-400', glow: 'shadow-yellow-500/20' };
    if (n.includes('streamsb')) return { label: 'StreamSB', icon: <Layers size={10} />, color: 'text-orange-400', glow: 'shadow-orange-500/20' };
    if (n.includes('mixdrop')) return { label: 'MixDrop', icon: <Globe size={10} />, color: 'text-pink-400', glow: 'shadow-pink-500/20' };
    if (n.includes('mp4upload')) return { label: 'Mp4Upload', icon: <Activity size={10} />, color: 'text-indigo-400', glow: 'shadow-indigo-500/20' };
    if (n.includes('filemoon')) return { label: 'FileMoon', icon: <Zap size={10} />, color: 'text-emerald-400', glow: 'shadow-emerald-500/20' };
    
    // Fallback
    return { 
      label: name.charAt(0).toUpperCase() + name.slice(1), 
      icon: <Server size={10} />, 
      color: 'text-slate-400',
      glow: 'shadow-white/5'
    };
  };

  const getStageColor = () => {
    switch (loadingStage) {
      case 'fetching': return 'text-blue-500';
      case 'decrypting': return 'text-purple-500';
      case 'buffering': return 'text-emerald-500';
      case 'ready': return 'text-emerald-400';
      default: return 'text-slate-500';
    }
  };

  const groupedServers = useMemo(() => {
    const groups: Record<string, ZenithSource[]> = {
      'Direct Streams': [],
      'Embed Nodes': []
    };
    
    availableServers.forEach(s => {
      if (s.isEmbed) {
        groups['Embed Nodes'].push(s);
      } else {
        groups['Direct Streams'].push(s);
      }
    });
    
    return groups;
  }, [availableServers]);

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
        {(isLoading || (loadingStage !== 'ready' && loadingStage !== 'idle')) && !error && (
          <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md space-y-8 transition-opacity duration-700 ${loadingStage === 'ready' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="relative w-32 h-32">
              {/* Progress Circle */}
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-white/5"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={377}
                  strokeDashoffset={377 - (377 * loadProgress) / 100}
                  strokeLinecap="round"
                  className={`${getStageColor()} transition-all duration-500 ease-out`}
                />
              </svg>
              
              {/* Center Icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`transition-all duration-500 ${getStageColor()}`}>
                  {loadingStage === 'fetching' && <Globe className="animate-pulse" size={32} />}
                  {loadingStage === 'decrypting' && <Shield className="animate-bounce" size={32} />}
                  {loadingStage === 'buffering' && <Activity className="animate-pulse" size={32} />}
                  {loadingStage === 'ready' && <Zap size={32} />}
                </div>
              </div>

              {/* Progress Text */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <p className={`text-[10px] font-black uppercase tracking-[0.5em] ${getStageColor()}`}>
                  {loadingText}
                </p>
                <p className="text-slate-500 text-[8px] mt-1 text-center font-mono opacity-50">
                  {loadProgress}% COMPLETE
                </p>
              </div>
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
              onClick={() => {
                setError(null);
                setIsLoading(true);
                setLoadingStage('fetching');
                // Trigger a re-fetch by slightly changing a state or just calling the fetch logic again
                const currentSource = source;
                setSource(currentSource === 'kuudere' ? 'allmanga' : 'kuudere');
                setTimeout(() => setSource(currentSource), 10);
              }}
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
                onLoad={() => {
                  setLoadingStage('ready');
                  setLoadProgress(100);
                }}
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
                src={{
                  src: activeSource.url.startsWith('http') ? `https://test.cors.workers.dev/?${encodeURIComponent(activeSource.url)}` : activeSource.url,
                  type: activeSource.url.includes('.txt') || activeSource.url.includes('.m3u8') ? 'application/x-mpegurl' : undefined
                }}
                onEnded={onComplete}
                onCanPlay={onCanPlay}
                onWaiting={() => {
                  setLoadingStage('buffering');
                  setLoadProgress(85);
                }}
                onPlaying={() => {
                  setLoadingStage('ready');
                  setLoadProgress(100);
                }}
                onError={handlePlayerError}
                onProviderSetup={(provider) => {
                  if (provider.type === 'hls') {
                    const hls = (provider as any).instance;
                    if (hls) {
                      hls.on(Hls.Events.MANIFEST_LOADING, () => {
                        setLoadingStage('fetching');
                        setLoadProgress(30);
                      });
                      hls.on(Hls.Events.MANIFEST_LOADED, () => {
                        setLoadingStage('buffering');
                        setLoadProgress(50);
                      });
                      hls.on(Hls.Events.FRAG_LOADING, () => {
                        setLoadingStage('decrypting');
                        setLoadProgress(70);
                      });
                      hls.on(Hls.Events.FRAG_DECRYPTED, () => {
                        setLoadingStage('buffering');
                        setLoadProgress(90);
                      });
                    }
                    // Use a safer way to apply config
                    try {
                      (provider as any).config = { ...(provider as any).config, ...hlsConfig };
                    } catch (e) {
                      console.warn("Failed to apply hlsConfig via provider.config", e);
                    }
                  }
                }}
                className="w-full h-full"
                playsInline
                crossOrigin
              >
                <MediaProvider>
                  <Poster
                    className="vds-poster absolute inset-0 block h-full w-full opacity-0 transition-opacity data-[visible]:opacity-100"
                    src={poster || "https://picsum.photos/seed/zenith/1280/720?blur=10"}
                    alt="Poster"
                  />
                  {activeSource.subtitles?.map((track, i) => {
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
                <DefaultVideoLayout 
                  icons={defaultLayoutIcons} 
                  thumbnails={activeSource.thumbnails ? (activeSource.thumbnails.startsWith('http') ? `https://test.cors.workers.dev/?${encodeURIComponent(activeSource.thumbnails)}` : activeSource.thumbnails) : undefined} 
                />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Source and Audio */}
        <div className="flex flex-col gap-6">
          {/* Source Dropdown */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] flex flex-col gap-5 transition-all hover:border-white/10 group/card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 group-hover/card:scale-110 transition-transform">
                  <Globe size={20} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Extraction Source</p>
                  <div className="relative mt-2">
                    <select 
                      value={source}
                      onChange={(e) => setSource(e.target.value as any)}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-black text-white uppercase tracking-tight focus:outline-none focus:border-blue-500/50 appearance-none pr-10 cursor-pointer transition-all hover:bg-black/80"
                    >
                      <option value="kuudere">Kuudere</option>
                      <option value="allmanga">AllManga</option>
                      <option value="anizone">Anizone</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="opacity-0 group-hover/card:opacity-100 transition-opacity">
                <Info size={14} className="text-slate-600" />
              </div>
            </div>
          </div>

          {/* Audio Type Toggle */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] flex flex-col gap-5 transition-all hover:border-white/10 group/card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 group-hover/card:scale-110 transition-transform">
                  <Headphones size={20} className="text-emerald-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Audio Protocol</p>
                  <p className="text-sm font-black text-white uppercase tracking-tight">{audioType}</p>
                </div>
              </div>
              <div className="opacity-0 group-hover/card:opacity-100 transition-opacity">
                <Shield size={14} className="text-slate-600" />
              </div>
            </div>
            
            <div className="flex gap-1.5 p-1.5 bg-black/60 rounded-2xl border border-white/5">
              {(['sub', 'dub'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAudioType(t)}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    audioType === t 
                      ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-600/30 scale-[1.02]' 
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Server Selector */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] flex flex-col gap-5 transition-all hover:border-white/10 group/card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20 group-hover/card:scale-110 transition-transform">
                <Layers size={20} className="text-purple-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Server Matrix</p>
                <p className="text-sm font-black text-white uppercase tracking-tight">
                  {activeSource ? getServerDisplay(activeSource.server).label : 'Awaiting Selection'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-purple-500/10 px-2 py-1 rounded-full border border-purple-500/20">
              <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest">{availableServers.length} Nodes</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-6 overflow-y-auto max-h-[450px] pr-2 custom-scrollbar">
            {availableServers.length > 0 ? (
              Object.entries(groupedServers).map(([groupName, servers]) => (
                servers.length > 0 && (
                  <div key={groupName} className="space-y-3">
                    <h4 className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] px-2 flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-slate-700"></div>
                      {groupName}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {servers.map((s, idx) => {
                        const display = getServerDisplay(s.server);
                        const isActive = activeSource?.url === s.url;
                        return (
                          <button
                            key={`${s.server}-${idx}`}
                            onClick={() => handleServerSwitch(s)}
                            className={`relative p-4 rounded-2xl text-left transition-all border group/btn flex flex-col gap-2 ${
                              isActive 
                                ? `bg-purple-600/10 border-purple-500 shadow-xl ${display.glow} scale-[1.02]` 
                                : 'bg-black/40 border-white/5 hover:border-white/20 hover:bg-black/60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-[8px] font-mono ${isActive ? 'text-purple-400' : 'text-slate-600'}`}>
                                {s.nodeId}
                              </span>
                              <div className={isActive ? 'text-purple-400' : 'text-slate-500 group-hover/btn:text-slate-300 transition-colors'}>
                                {display.icon}
                              </div>
                            </div>
                            
                            <span className={`text-[11px] font-black uppercase tracking-tight truncate ${isActive ? 'text-white' : 'text-slate-400 group-hover/btn:text-slate-200'}`}>
                              {display.label}
                            </span>
                            
                            <div className="flex items-center justify-between mt-auto pt-1">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1 h-1 rounded-full ${s.isVerified ? 'bg-emerald-500' : 'bg-amber-500'} ${isActive ? 'animate-pulse' : ''}`}></div>
                                <span className={`text-[7px] font-black uppercase tracking-widest ${s.isVerified ? 'text-emerald-500/60' : 'text-amber-500/60'}`}>
                                  {s.isVerified ? 'Stable' : 'Unstable'}
                                </span>
                              </div>
                            </div>

                            {isActive && (
                              <div className="absolute -top-1 -right-1">
                                <div className="w-3 h-3 bg-purple-500 rounded-full border-2 border-slate-950 flex items-center justify-center">
                                  <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              ))
            ) : (
              <div className="py-8 flex flex-col items-center justify-center gap-3 bg-black/20 rounded-2xl border border-dashed border-white/5">
                <Loader2 size={16} className="text-slate-700 animate-spin" />
                <p className="text-[9px] text-slate-600 uppercase font-black tracking-widest">Scanning for nodes...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-6 py-2 bg-white/5 rounded-full border border-white/5">
        <div className="flex items-center gap-3">
          <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`}></div>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            {isLoading ? loadingText : 'Matrix Link Stable'}
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
