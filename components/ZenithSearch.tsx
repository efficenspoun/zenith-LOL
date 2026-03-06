import React, { useState } from 'react';
import { Search, Play, Server, Headphones, Globe, AlertCircle, Loader2 } from 'lucide-react';
import { ZENITH_API_BASE } from '../constants';

/**
 * TypeScript Interfaces for the Zenith API Response
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

    const baseUrl = `${ZENITH_API_BASE}/anime`;
    const params = new URLSearchParams({
      query: query.trim(),
      episode: episode.toString(),
      source: source,
      type: type
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
                    url: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`
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
              
              // Handle ALLMANGA "Default" source where url is an object
              if (typeof streamUrl === 'object' && streamUrl !== null) {
                if (streamUrl.sources && Array.isArray(streamUrl.sources)) {
                  streamUrl = streamUrl.sources[0]?.url || '';
                } else if (streamUrl.url) {
                  streamUrl = streamUrl.url;
                }
              }
              
              return {
                url: typeof streamUrl === 'string' ? streamUrl : '',
                server: s.server || s.name || 'Unknown Node',
                type: s.type || 'Unknown'
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
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header Section */}
      <div className="space-y-2">
        <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic">Zenith Search Node</h2>
        <p className="text-slate-500 text-sm font-mono uppercase tracking-widest">Manual Source Extraction Protocol</p>
      </div>

      {/* 3. UI Elements: Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/50 p-8 rounded-[2rem] border border-white/5 backdrop-blur-xl">
        
        {/* Anime Title Search */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Search size={12} /> Anime Title
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Solo Leveling"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500/50 transition-all font-medium"
          />
        </div>

        {/* Episode Number */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Play size={12} /> Episode
          </label>
          <input
            type="number"
            min={1}
            value={episode}
            onChange={(e) => setEpisode(parseInt(e.target.value) || 1)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-all font-mono"
          />
        </div>

        {/* Source Selection */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Globe size={12} /> Extraction Source
          </label>
          <div className="flex gap-2 p-1 bg-black/40 rounded-xl border border-white/10">
            {(['kuudere', 'allmanga'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  source === s ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Audio Type Selection */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Headphones size={12} /> Audio Protocol
          </label>
          <div className="flex gap-2 p-1 bg-black/40 rounded-xl border border-white/10">
            {(['sub', 'dub'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  type === t ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Fetch Button */}
        <div className="md:col-span-2 pt-4">
          <button
            onClick={fetchStreams}
            disabled={isLoading}
            className="w-full bg-white text-black hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-3 shadow-xl shadow-white/5"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Synchronizing...
              </>
            ) : (
              <>
                <Server size={16} />
                Fetch Streams
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start gap-4 text-red-400">
          <AlertCircle className="shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-tight">Access Denied</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* 5. Display: Results List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Extracted Links ({results.length})</h3>
          {results.length > 0 && (
            <span className="text-[10px] font-mono text-emerald-500 animate-pulse">MATRIX STABLE</span>
          )}
        </div>

        {results.length > 0 ? (
          <div className="grid gap-3">
            {results.map((item, index) => (
              <div 
                key={index}
                className="group bg-slate-900/40 border border-white/5 p-4 rounded-2xl hover:border-blue-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20 group-hover:bg-blue-500/20 transition-all">
                    <Play size={16} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-tight">{item.server}</p>
                    <p className="text-[10px] font-mono text-slate-500 uppercase">{item.type}</p>
                  </div>
                </div>
                
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg text-[10px] font-mono text-blue-400 truncate max-w-xs transition-all border border-white/5"
                >
                  {item.url}
                </a>
              </div>
            ))}
          </div>
        ) : !isLoading && !error && (
          <div className="py-12 border-2 border-dashed border-white/5 rounded-[2rem] flex flex-col items-center justify-center text-slate-700 space-y-2">
            <Server size={32} strokeWidth={1} />
            <p className="text-[10px] font-black uppercase tracking-widest">Awaiting Input Parameters</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZenithSearch;
