import React, { useState } from 'react';
import { Search, Play, Server, Headphones, Globe, AlertCircle, Loader2, Zap, Activity, Layers, Shield, Info, ChevronRight, ExternalLink } from 'lucide-react';
import { ZENITH_API_BASE } from '../constants';

/**
 * TypeScript Interfaces for the Zenith API Response
 */
interface ZenithSource {
  url: string;
  server: string;
  type: string;
  isEmbed?: boolean;
  isVerified?: boolean;
}

interface ZenithApiResponse {
  status: string;
  sources: ZenithSource[];
}

const ZenithSearch: React.FC = () => {
  // 1. State Management
  const [query, setQuery] = useState<string>('');
  const [episode, setEpisode] = useState<number>(1);
  const [source, setSource] = useState<'kuudere' | 'allmanga'>('kuudere');
  const [type, setType] = useState<'sub' | 'dub'>('sub');
  
  // UI State
  const [results, setResults] = useState<ZenithSource[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 4. Logic: Async function to fetch streaming links
   */
  const fetchStreams = async () => {
    if (!query.trim()) {
      setError('Please enter an anime title to search.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);

    // Use the base /anime path with query parameters as per user requirement
    const baseUrl = `${ZENITH_API_BASE}/anime`;
    const params = new URLSearchParams({
      query: query.trim(),
      episode: episode.toString(),
      source: source
    });
    if (type) {
      params.append('type', type);
    }
    const targetUrl = `${baseUrl}?${params.toString()}`;

    // Multi-proxy fallback strategy
    const proxies = [
      { name: 'Direct', url: (u: string) => u, timeout: 5000 },
      { name: 'Proxy A (AllOrigins Raw)', url: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: 'Proxy B (CorsProxy.io)', url: (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: 'Proxy C (Codetabs)', url: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: 'Proxy D (AllOrigins JSON)', url: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, timeout: 12000, isJsonWrap: true },
      { name: 'Proxy E (CORS Workers)', url: (u: string) => `https://test.cors.workers.dev/?${encodeURIComponent(u)}`, timeout: 10000 },
      { name: "Proxy F (Corsfix)", url: (u: string) => `https://proxy.corsfix.com/?${encodeURIComponent(u)}`, timeout: 10000 },
      { name: "Proxy G (Corslol)", url: (u: string) => `https://cors.lol/?url=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: "Proxy H (Corsx2u)", url: (u: string) => `https://cors.x2u.in/?url=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: "Proxy I (thebugging)", url: (u: string) => `https://www.thebugging.com/apis/cors-proxy?url=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: "Proxy J (hackeryou)", url: (u: string) => `https://proxy.hackeryou.com/?url=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: "Proxy K (proxyuwu)", url: (u: string) => `https://proxyuwu.ilikechez87.workers.dev/?${encodeURIComponent(u)}`, timeout: 10000 },
    ];

    let lastError: any = null;
    let success = false;

    for (const proxy of proxies) {
      try {
        console.log(`[Zenith Search] Attempting extraction via ${proxy.name}...`);
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
          // Check content type before parsing as JSON to avoid "Unexpected token <"
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
          
          if (rawSources && Array.isArray(rawSources)) {
            const normalized = rawSources.map((s: any) => {
              let streamUrl = s.url;
              const serverName = (s.server || s.name || 'Unknown Node').toUpperCase();
              
              // Handle ALLMANGA "Default" source where url is an object
              if (typeof streamUrl === 'object' && streamUrl !== null) {
                if (streamUrl.sources && Array.isArray(streamUrl.sources)) {
                  // Try to find 1080p or 720p, otherwise take the first one
                  const preferred = streamUrl.sources.find((src: any) => src.quality === '1080p') || 
                                  streamUrl.sources.find((src: any) => src.quality === '720p') || 
                                  streamUrl.sources[0];
                  streamUrl = preferred?.url || '';
                } else if (streamUrl.url) {
                  streamUrl = streamUrl.url;
                }
              }

              if (typeof streamUrl !== 'string') {
                streamUrl = String(streamUrl || '');
              }

              const urlStr = streamUrl;
              const isVideoLink = urlStr.includes('.mp4') || urlStr.includes('.m3u8') || urlStr.includes('.mkv') || urlStr.includes('video.wixstatic.com');

              // Determine if it's an embed
              let isEmbed = (s.type === 'iframe' || s.type === 'player' || s.isEmbed) && !isVideoLink;
              if (source === 'allmanga' && (serverName === 'DEFAULT' || serverName === 'ALLANIME') && isVideoLink) {
                isEmbed = false;
              }

              // Verification Logic for AllManga
              let isVerified = true;
              if (source === 'allmanga') {
                const subVerified = ['DEFAULT', 'YT', 'S-MP4', 'OK', 'YT-MP4'];
                const dubVerified = ['DEFAULT', 'YT', 'S-MP4', 'OK', 'UV-MP4', 'YT-MP4'];
                const verifiedList = type === 'sub' ? subVerified : dubVerified;
                isVerified = verifiedList.includes(serverName);
              }
              
              return {
                url: urlStr,
                server: s.server || s.name || 'Unknown Node',
                type: s.type || 'Unknown',
                isEmbed: isEmbed,
                isVerified: isVerified
              };
            }).filter(s => s.url);

            setResults(normalized);
            success = true;
            console.log(`[Zenith Search] Extraction successful via ${proxy.name}`);
            break;
          } else if (data.status === 'success' || (data as any).status === 'ok') {
            setError('No streaming sources found for this selection.');
            success = true;
            break;
          }
        }
        
        throw new Error(data.status || (data as any).message || 'Unknown matrix error');
      } catch (err: any) {
        console.warn(`[Zenith Search] ${proxy.name} failed:`, typeof err === 'object' ? (err?.message || 'Unknown Error') : String(err));
        lastError = err;
      }
    }

    if (!success) {
      console.error('Zenith Search Failed:', typeof lastError === 'object' ? (lastError?.message || 'Unknown Error') : String(lastError));
      if (lastError?.name === 'TypeError' || lastError?.message?.includes('Failed to fetch')) {
        setError('Network connection blocked. Ensure the API port is set to Public in your environment.');
      } else {
        setError(lastError?.message || 'All synchronization routes exhausted. The Zenith Matrix is offline.');
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-10 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="space-y-3 relative">
        <div className="absolute -left-12 top-1/2 -translate-y-1/2 w-1 h-12 bg-blue-600 rounded-full blur-sm hidden lg:block"></div>
        <h2 className="text-5xl font-black tracking-tighter text-white uppercase italic leading-none">
          Zenith <span className="text-slate-700">Search</span> Node
        </h2>
        <div className="flex items-center gap-4">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">Manual Source Extraction Protocol</p>
          <div className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
        </div>
      </div>

      {/* 3. UI Elements: Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-900/30 p-8 rounded-[3rem] border border-white/5 backdrop-blur-2xl shadow-3xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
        
        {/* Anime Title Search */}
        <div className="space-y-3 relative z-10">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
            <Search size={10} className="text-blue-500" /> Anime Title
          </label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Solo Leveling"
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder:text-slate-800 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all font-bold"
            />
          </div>
        </div>

        {/* Episode Number */}
        <div className="space-y-3 relative z-10">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
            <Play size={10} className="text-emerald-500" /> Episode
          </label>
          <input
            type="number"
            min={1}
            value={episode}
            onChange={(e) => setEpisode(parseInt(e.target.value) || 1)}
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all font-mono font-bold"
          />
        </div>

        {/* Source Selection */}
        <div className="space-y-3 relative z-10">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
            <Globe size={10} className="text-purple-500" /> Source
          </label>
          <div className="flex gap-1.5 p-1.5 bg-black/40 rounded-2xl border border-white/10">
            {(['kuudere', 'allmanga'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                  source === s 
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                    : 'text-slate-600 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Audio Type Selection */}
        <div className="space-y-3 relative z-10">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
            <Headphones size={10} className="text-amber-500" /> Audio
          </label>
          <div className="flex gap-1.5 p-1.5 bg-black/40 rounded-2xl border border-white/10">
            {(['sub', 'dub'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                  type === t 
                    ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-600/20' 
                    : 'text-slate-600 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Fetch Button */}
        <div className="md:col-span-2 lg:col-span-4 pt-4 relative z-10">
          <button
            onClick={fetchStreams}
            disabled={isLoading}
            className="group w-full bg-white text-black hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed py-5 rounded-[1.5rem] font-black uppercase tracking-[0.4em] text-[10px] transition-all flex items-center justify-center gap-4 shadow-2xl shadow-white/5"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Synchronizing Matrix...
              </>
            ) : (
              <>
                <Server size={18} className="group-hover:rotate-12 transition-transform" />
                Initialize Extraction
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-[2rem] flex items-start gap-5 text-red-400 animate-in slide-in-from-top-4 duration-500">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20 shrink-0">
            <AlertCircle size={20} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest">Access Denied</p>
            <p className="text-xs opacity-80 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* 5. Display: Results List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Extracted Nodes ({results.length})</h3>
          </div>
          {results.length > 0 && (
            <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              <Zap size={10} className="text-emerald-500" />
              <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Signal Stable</span>
            </div>
          )}
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((item, index) => (
              <div 
                key={index}
                className="group bg-slate-900/40 border border-white/5 p-6 rounded-[2rem] hover:border-blue-500/30 transition-all flex flex-col gap-5 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink size={14} className="text-slate-700" />
                </div>

                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 group-hover:scale-110 transition-transform">
                    <Activity size={20} className="text-blue-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-black text-white uppercase tracking-tight">{item.server}</p>
                      {item.isVerified ? (
                        <div className="flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                           <Shield size={8} className="text-emerald-500" />
                           <span className="text-[7px] text-emerald-500 font-black uppercase">Verified</span>
                        </div>
                      ) : (
                        <span className="text-[7px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-md font-black uppercase">Unverified</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{item.type}</p>
                      <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{item.isEmbed ? 'Embed Mode' : 'Native Stream'}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                   <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest px-1">Node Address</p>
                   <a 
                    href={item.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block w-full bg-black/40 hover:bg-black/60 px-5 py-3 rounded-xl text-[10px] font-mono text-blue-400/80 truncate transition-all border border-white/5 group-hover:border-blue-500/20"
                  >
                    {item.url}
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : !isLoading && !error && (
          <div className="py-24 bg-slate-900/20 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center text-slate-700 space-y-6">
            <div className="w-20 h-20 bg-slate-900/50 rounded-full flex items-center justify-center border border-white/5">
              <Layers size={32} strokeWidth={1} className="text-slate-800" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.5em]">Awaiting Input Parameters</p>
              <p className="text-[9px] font-medium text-slate-800 uppercase">Synchronize with the Zenith Matrix to begin extraction</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZenithSearch;
