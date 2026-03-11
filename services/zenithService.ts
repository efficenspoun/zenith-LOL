
import { SourceResult, SourceType, SourceCategory, Anime, ApiResponse } from '../types';
import { ZENITH_API_BASE } from '../constants';

export const getZenithSources = async (
  malId: number,
  episodeNumber: number,
  category: SourceCategory,
  provider: string,
  animeContext?: Anime
): Promise<SourceResult[]> => {
  try {
    const query = (animeContext?.title_english || animeContext?.title || 'Anime').trim();
    const sourceParam = provider.toLowerCase();
    const typeParam = category === 'dub' ? 'dub' : 'sub';

    const url = `${ZENITH_API_BASE}/anime?query=${encodeURIComponent(query)}&episode=${episodeNumber}&source=${sourceParam}&type=${typeParam}`;

    const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 8000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(new Error('Request timed out')), timeout);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(id);
        return response;
      } catch (e: any) {
        clearTimeout(id);
        if (e.name === 'AbortError' || e.message === 'Request timed out') {
          throw new Error(`Timeout after ${timeout}ms`);
        }
        throw e;
      }
    };

    const proxies = [
      { name: 'Direct', url: (u: string) => u, timeout: 4000 },
      { name: 'Proxy A (AllOrigins Raw)', url: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: 'Proxy B (CorsProxy.io)', url: (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`, timeout: 10000 },
      { name: 'Proxy C (Codetabs)', url: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, timeout: 10000 },
      { name: 'Proxy D (AllOrigins JSON)', url: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, timeout: 12000, isJsonWrap: true },
      { name: 'Proxy E (CORS.sh)', url: (u: string) => `https://proxy.cors.sh/${u}`, timeout: 10000 },
      { name: 'Proxy F (CORS Workers)', url: (u: string) => `https://test.cors.workers.dev/?${encodeURIComponent(u)}`, timeout: 10000 }
    ];

    let response: Response | undefined;
    let lastError: any;

    for (const proxy of proxies) {
      try {
        console.log(`[Zenith] Attempting fetch via ${proxy.name}...`);
        const targetUrl = proxy.url(url);
        
        // Use a "Clean Fetch" - some proxies reject custom headers or Cache-Control
        const fetchOptions: RequestInit = {
          method: 'GET',
          credentials: 'omit',
          mode: 'cors'
        };

        const fetchResponse = await fetchWithTimeout(targetUrl, fetchOptions, proxy.timeout);
        
        if (fetchResponse.ok) {
          if (proxy.isJsonWrap) {
            const json = await fetchResponse.json();
            if (json.contents) {
              console.log(`[Zenith] Successfully extracted content from ${proxy.name}`);
              // Create a mock response that matches the expected interface
              response = {
                ok: true,
                status: 200,
                json: async () => JSON.parse(json.contents),
                text: async () => json.contents,
                headers: new Headers({ 'content-type': 'application/json' })
              } as any;
              break;
            }
          } else {
            response = fetchResponse;
            console.log(`[Zenith] Successfully fetched via ${proxy.name}`);
            break;
          }
        }
        
        const errorText = await fetchResponse.text().catch(() => 'No error body');
        console.warn(`[Zenith] ${proxy.name} returned status ${fetchResponse.status}`);
        lastError = new Error(`${proxy.name} failed (${fetchResponse.status})`);
      } catch (e: any) {
        lastError = e;
        const isNetworkError = e instanceof TypeError || e.message === 'Failed to fetch';
        console.warn(`[Zenith] ${proxy.name} ${isNetworkError ? 'Network Blocked' : 'Error'}:`, typeof e === 'object' ? (e?.message || 'Unknown Error') : String(e));
      }
    }

    if (!response || !response.ok) {
      const isFailedToFetch = lastError?.message === 'Failed to fetch' || lastError instanceof TypeError;
      const errorMessage = isFailedToFetch 
        ? "The browser or a security extension is blocking the connection to the Zenith Matrix. Please check if your API port is 'Public'."
        : (lastError?.message || 'All connection routes exhausted');
      
      console.error(`[Zenith] Critical Failure: ${errorMessage}`);
      throw new Error(`Zenith Service Unavailable: ${errorMessage}`);
    }

    if (!response.ok) {
      throw new Error(`Zenith API Error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Expected JSON but got:', text.substring(0, 100));
      throw new Error('Zenith API returned non-JSON response. Check if the API is public and reachable.');
    }

    const data: ApiResponse = await response.json();

    const rawSources = data.sources || (data as any).data?.sources || (data as any).result?.sources || (data as any).data;

    if ((data.status !== 'success' && (data as any).status !== 'ok') || !rawSources || !Array.isArray(rawSources)) {
      return [];
    }

    return rawSources.map((src: any) => {
      let streamUrl = src.url;
      let isEmbed = src.type === 'iframe';
      
      // Handle ALLMANGA "Default" source where url is an object
      if (typeof streamUrl === 'object' && streamUrl !== null) {
        if (streamUrl.sources && Array.isArray(streamUrl.sources)) {
          const preferred = streamUrl.sources.find((src: any) => src.quality === '1080p') || 
                          streamUrl.sources.find((src: any) => src.quality === '720p') || 
                          streamUrl.sources[0];
          streamUrl = preferred?.url || '';
          isEmbed = false;
        } else if (streamUrl.url) {
          streamUrl = streamUrl.url;
        }
      }
      
      if (typeof streamUrl !== 'string') {
        streamUrl = String(streamUrl || '');
      }
      
      // Re-evaluate isEmbed for AllManga direct links
      if (provider === 'allmanga' && (streamUrl.includes('.m3u8') || streamUrl.includes('.mp4'))) {
        isEmbed = false;
      }

      return {
        url: typeof streamUrl === 'string' ? streamUrl : '',
        type: isEmbed ? SourceType.EMBED : SourceType.DIRECT,
        provider: provider,
        pluginName: src.server || src.name || 'Unknown',
        label: `${src.server || src.name || 'Unknown'} (${(src.type || 'HLS').toUpperCase()})`,
        category: category,
        subtitles: src.subtitles || [],
        metadata: {
          server: src.server || src.name,
          subtitles: src.subtitles || []
        }
      };
    }).filter(s => s.url);
  } catch (error: any) {
    console.error('Zenith Service Error:', typeof error === 'object' ? (error?.message || 'Unknown Error') : String(error));
    return [];
  }
};
