
import { JIKAN_API_BASE } from '../constants';
import { Anime, Episode } from '../types';

const animeCache = new Map<number, Anime>();

export const getAnimeData = async (malId: number): Promise<Anime> => {
  // Return from cache if available to prevent 429s
  if (animeCache.has(malId)) return animeCache.get(malId)!;

  const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
    try {
      const response = await fetch(url);
      if ((response.status === 429 || response.status === 408) && retries > 0) {
        // Jikan rate limit or timeout - wait and retry
        await new Promise(resolve => setTimeout(resolve, 1500));
        return fetchWithRetry(url, retries - 1);
      }
      return response;
    } catch (e) {
      if (retries > 0) {
        console.warn('Jikan fetch failed, trying proxy...', e?.message || e);
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        return fetch(proxyUrl);
      }
      throw e;
    }
  };

  const response = await fetchWithRetry(`${JIKAN_API_BASE}/anime/${malId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch anime details: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  if (!data.data) throw new Error('Invalid response from Jikan API');
  
  animeCache.set(malId, data.data);
  return data.data;
};

export const searchAnime = async (query: string): Promise<Anime[]> => {
  const response = await fetch(`${JIKAN_API_BASE}/anime?q=${encodeURIComponent(query)}&limit=20`);
  if (!response.ok) throw new Error('Failed to search anime');
  const data = await response.json();
  return data.data;
};

export interface EpisodesResponse {
  data: Episode[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
  };
}

export const getAnimeEpisodes = async (malId: number, page: number = 1): Promise<EpisodesResponse> => {
  const response = await fetch(`${JIKAN_API_BASE}/anime/${malId}/episodes?page=${page}`);
  if (!response.ok) throw new Error('Failed to fetch episodes');
  const data = await response.json();
  
  return {
    data: data.data.map((ep: any) => ({
      mal_id: ep.mal_id,
      title: ep.title,
      episode_id: ep.mal_id.toString(),
      number: ep.mal_id,
      aired: ep.aired
    })),
    pagination: data.pagination
  };
};
