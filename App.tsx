
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Anime, Episode, SourceResult, User } from './types';
import { DEFAULT_PLUGINS } from './constants';
import { searchAnime, getAnimeData, getAnimeEpisodes } from './services/jikanService';
import { fetchViewer, updateAniListProgress } from './services/anilistService';
import { resolveSource } from './services/pluginService';
import AnimePlayer from './components/AnimePlayer';
import ZenithPlayer from './components/ZenithPlayer';
import ZenithSearch from './components/ZenithSearch';
import { SearchIcon, PlayIcon } from './components/Icons';

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  
  const [allEpisodes, setAllEpisodes] = useState<Episode[]>([]);
  const [displayedEpisodes, setDisplayedEpisodes] = useState<Episode[]>([]);
  const [batchPage, setBatchPage] = useState(1);
  const [isAppending, setIsAppending] = useState(false);
  const BATCH_SIZE = 50;

  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [availableSources, setAvailableSources] = useState<SourceResult[]>([]);
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [activePluginId] = useState<string>(DEFAULT_PLUGINS[0].id);
  const [user, setUser] = useState<User | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [view, setView] = useState<'player' | 'zenith-search'>('player');
  const [token, setToken] = useState<string | null>(localStorage.getItem('anilist_token'));

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const newToken = new URLSearchParams(hash.substring(1)).get('access_token');
      if (newToken) {
        setToken(newToken);
        localStorage.setItem('anilist_token', newToken);
        window.location.hash = '';
      }
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchViewer(token).then(setUser).catch(() => {
        setToken(null);
        localStorage.removeItem('anilist_token');
      });
    }
  }, [token]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSelectedAnime(null);
    setSelectedEpisode(null);
    setAvailableSources([]);
    setView('player');
    navigate('/');
    
    try {
      const results = await searchAnime(searchQuery);
      setSearchResults(results);
    } catch (err: any) {
      console.error(typeof err === 'object' ? (err?.message || 'Unknown Error') : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const fetchEpisodes = async (anime: Anime) => {
    try {
      const resp = await getAnimeEpisodes(anime.mal_id);
      setAllEpisodes(resp.data);
      setDisplayedEpisodes(resp.data.slice(0, BATCH_SIZE));
      setBatchPage(1);
      return resp.data;
    } catch (err: any) {
      console.error("Failed to fetch real episodes, falling back to mock:", typeof err === 'object' ? (err?.message || 'Unknown Error') : String(err));
      const mockCount = anime.episodes || 24;
      const mocks: Episode[] = Array.from({ length: mockCount }, (_, i) => ({
        mal_id: i + 1,
        number: i + 1,
        episode_id: `ep-${i + 1}`,
        title: `Episode ${i + 1}`,
        aired: new Date().toISOString()
      }));
      setAllEpisodes(mocks);
      setDisplayedEpisodes(mocks.slice(0, BATCH_SIZE));
      return mocks;
    }
  };

  const handleSelectAnime = async (anime: Anime) => {
    setSelectedAnime(anime);
    setSearchResults([]);
    setSearchQuery('');
    setView('player');
    fetchEpisodes(anime);
    const animeSlug = normalizeTitle(anime.title_english || anime.title);
    navigate(`/anime/${anime.mal_id}/${animeSlug}`);
  };

  const handleSelectEpisode = useCallback(async (episode: Episode, animeContext?: Anime) => {
    const anime = animeContext || selectedAnime;
    if (!anime) return;
    
    setSelectedEpisode(episode);
    setAvailableSources([]);
    setResolutionError(null);
    
    // Update URL immediately for feedback
    const animeSlug = normalizeTitle(anime.title_english || anime.title);
    const targetPath = `/anime/${anime.mal_id}/${animeSlug}/episode/${episode.number}`;
    
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  }, [selectedAnime, navigate, location.pathname]);

  const loadMoreEpisodes = () => {
    setIsAppending(true);
    setTimeout(() => {
      const nextPage = batchPage + 1;
      const end = nextPage * BATCH_SIZE;
      setDisplayedEpisodes(allEpisodes.slice(0, end));
      setBatchPage(nextPage);
      setIsAppending(false);
    }, 400);
  };

  useEffect(() => {
    const syncFromUrl = async () => {
      const pathParts = location.pathname.split('/').filter(Boolean);
      const animeIdx = pathParts.indexOf('anime');
      
      if (animeIdx === -1 || !pathParts[animeIdx + 1]) {
        setSelectedAnime(null);
        setSelectedEpisode(null);
        setAvailableSources([]);
        setIsInitialLoading(false);
        return;
      }

      const malIdStr = pathParts[animeIdx + 1];
      const id = parseInt(malIdStr);
      
      if (isNaN(id) || id <= 0) {
        setIsInitialLoading(false);
        return;
      }

      const episodeIdx = pathParts.indexOf('episode');
      const epNumStr = episodeIdx !== -1 ? pathParts[episodeIdx + 1] : null;
      try {
        if (!selectedAnime || selectedAnime.mal_id !== id) {
          setIsSearching(true);
          const animeData = await getAnimeData(id);
          setSelectedAnime(animeData);
          const episodes = await fetchEpisodes(animeData);

          if (epNumStr) {
            const num = parseInt(epNumStr);
            const foundEp = episodes.find(e => e.number === num) || {
              mal_id: num,
              number: num,
              episode_id: `ep-${num}`,
              title: `Episode ${num}`
            };
            await handleSelectEpisode(foundEp, animeData);
          }
        } else if (epNumStr) {
          const num = parseInt(epNumStr);
          if (selectedEpisode?.number !== num) {
            const foundEp = allEpisodes.find(e => e.number === num) || {
              mal_id: num,
              number: num,
              episode_id: `ep-${num}`,
              title: `Episode ${num}`
            };
            await handleSelectEpisode(foundEp, selectedAnime);
          }
        }
      } catch (err: any) {
        console.error("Deep link sync failed:", typeof err === 'object' ? (err?.message || 'Unknown Error') : String(err));
      } finally {
        setIsSearching(false);
        setIsInitialLoading(false);
      }
    };

    syncFromUrl();
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200 selection:bg-blue-500/30">
      <header className="bg-slate-900/40 backdrop-blur-2xl border-b border-white/5 px-8 py-5 flex items-center justify-between sticky top-0 z-[60]">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => navigate('/')}>
          <div className="bg-blue-600 p-2.5 rounded-2xl shadow-2xl shadow-blue-600/20 group-hover:scale-105 transition-all">
            <PlayIcon className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-500">
            ZENITH
          </h1>
        </div>

        <form onSubmit={handleSearch} className="flex-1 max-w-lg mx-12 relative hidden md:block">
          <input
            type="text"
            placeholder="Search anime database..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/60 border border-white/5 rounded-2xl px-6 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm backdrop-blur-md"
          />
          <button type="submit" className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
            <SearchIcon size={18} />
          </button>
        </form>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView(view === 'player' ? 'zenith-search' : 'player')}
            className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              view === 'zenith-search' 
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' 
                : 'bg-slate-800 hover:bg-slate-700 border-white/5 text-slate-300'
            }`}
          >
            {view === 'zenith-search' ? 'Back to Player' : 'Zenith Search'}
          </button>

          {user ? (
            <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-2xl border border-white/10">
              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full ring-2 ring-blue-500/20" />
              <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">{user.name}</span>
            </div>
          ) : (
            <button 
              onClick={() => window.location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=22153&response_type=token&redirect_uri=${encodeURIComponent(window.location.origin)}`}
              className="bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
            >
              Sync AniList
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto px-6 py-12">
        {view === 'zenith-search' ? (
          <ZenithSearch />
        ) : (
          <>
            {isSearching && (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
            <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-slate-500 font-black uppercase tracking-[0.5em] text-[9px]">Analyzing Metadata</p>
          </div>
        )}

        {searchResults.length > 0 && !selectedAnime && !isSearching && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {searchResults.map((anime, index) => (
              <div 
                key={`${anime.mal_id}-${index}`} 
                className="group cursor-pointer bg-slate-900/40 rounded-3xl overflow-hidden border border-white/5 hover:border-blue-500/30 transition-all hover:-translate-y-2 shadow-2xl"
                onClick={() => handleSelectAnime(anime)}
              >
                <div className="aspect-[10/14] relative overflow-hidden">
                  <img src={anime.images.jpg.large_image_url} alt={anime.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-5">
                    <div className="w-full bg-blue-600/90 backdrop-blur-md py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-center shadow-2xl">Stream Series</div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-xs font-black line-clamp-1 group-hover:text-blue-400 transition-colors uppercase tracking-tight">
                    {anime.title_english || anime.title}
                  </h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase">{anime.year || 'TBA'}</span>
                    <span className="text-[10px] text-yellow-500 font-black">★ {anime.score}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedAnime && !isSearching && (
          <div className="flex flex-col lg:flex-row gap-12 animate-in fade-in duration-700">
            <div className="flex-1 space-y-8 relative">
              {isResolvingSource && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm rounded-[2.5rem] space-y-6">
                  <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                  <div className="text-center">
                    <p className="text-blue-400 font-black uppercase tracking-[0.4em] text-xs">Synchronizing Stream</p>
                    <p className="text-slate-500 text-[10px] mt-2 font-medium">Establishing secure connection to Zenith Matrix...</p>
                  </div>
                </div>
              )}

              {selectedEpisode ? (
                <div className="space-y-8">
                  <ZenithPlayer 
                    query={selectedAnime.title_english || selectedAnime.title} 
                    alternativeQuery={selectedAnime.title}
                    episode={selectedEpisode.number}
                    poster={selectedAnime.images.jpg.large_image_url}
                    onComplete={() => {
                      if (token && selectedEpisode) updateAniListProgress(token, selectedAnime.mal_id, selectedEpisode.number);
                    }}
                  />
                  
                  <div className="bg-zinc-900/30 p-8 rounded-[2.5rem] border border-white/5 backdrop-blur-xl">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-10">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Episode {selectedEpisode?.number}</span>
                          <span className="text-zinc-600 font-black text-[9px] uppercase tracking-widest">
                            Provider: Zenith Matrix Node
                          </span>
                        </div>
                        <h2 className="text-4xl font-black tracking-tighter leading-none">{selectedEpisode?.title}</h2>
                        <p className="mt-4 text-sm text-zinc-500 font-medium leading-relaxed max-w-2xl">
                          Streaming from the zenith node. Multiple high-speed servers are available. Select your preferred latency route from the selection matrix.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-12">
                   <div className="w-full md:w-72 flex-shrink-0">
                     <img src={selectedAnime.images.jpg.large_image_url} alt={selectedAnime.title_english || selectedAnime.title} className="w-full rounded-[2.5rem] shadow-3xl border border-white/5" />
                   </div>
                   <div className="flex-1 space-y-8">
                     <div className="space-y-4">
                        <h2 className="text-6xl font-black tracking-tighter leading-[0.85]">{selectedAnime.title_english || selectedAnime.title}</h2>
                        <div className="flex flex-wrap gap-3">
                          <span className="bg-blue-600/10 text-blue-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-blue-500/20">{selectedAnime.status}</span>
                          <span className="bg-white/5 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/5">{allEpisodes.length || selectedAnime.episodes || '?'} EPISODES</span>
                        </div>
                        <p className="text-slate-400 leading-relaxed text-sm font-medium line-clamp-4">{selectedAnime.synopsis}</p>
                     </div>
                     
                     <div className="space-y-6 pt-6 border-t border-white/5">
                       <h3 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500">Episode Selection</h3>
                       <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                         {displayedEpisodes.map((ep, index) => (
                           <button
                             key={`${ep.mal_id}-${index}`}
                             onClick={() => handleSelectEpisode(ep)}
                             className="bg-slate-900/40 hover:bg-blue-600/10 border border-white/5 hover:border-blue-500/30 p-4 rounded-xl text-left transition-all group"
                           >
                             <div className="text-[8px] font-black text-slate-600 group-hover:text-blue-400 uppercase mb-1">Entry {ep.number}</div>
                             <div className="text-[10px] font-bold truncate text-slate-400 group-hover:text-white">Episode {ep.number}</div>
                           </button>
                         ))}
                       </div>
                       
                       {displayedEpisodes.length < allEpisodes.length && (
                         <button onClick={loadMoreEpisodes} className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                           {isAppending ? 'Syncing...' : 'Load More Episodes'}
                         </button>
                       )}
                     </div>
                   </div>
                </div>
              )}
            </div>

            {selectedEpisode && (
              <div className="w-full lg:w-96 space-y-6 sticky top-28 self-start animate-in fade-in slide-in-from-right-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500 px-2">Sequential Queue</h3>
                <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-3 custom-scrollbar">
                  {displayedEpisodes.map((ep, index) => (
                    <button
                      key={`queue-${ep.mal_id}-${index}`}
                      onClick={() => handleSelectEpisode(ep)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all border ${selectedEpisode?.mal_id === ep.mal_id ? 'bg-blue-600/10 border-blue-500/50 shadow-2xl' : 'bg-slate-900/30 border-transparent hover:bg-slate-900 hover:border-white/5'}`}
                    >
                      <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl font-black text-[11px] ${selectedEpisode?.mal_id === ep.mal_id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                        {ep.number}
                      </div>
                      <div className="text-left overflow-hidden">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`text-[10px] font-black uppercase truncate ${selectedEpisode?.mal_id === ep.mal_id ? 'text-blue-400' : 'text-slate-300'}`}>
                            Episode {ep.number}
                          </div>
                          {selectedEpisode?.mal_id === ep.mal_id && (
                            <div className="flex items-center gap-1 bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-500/20">
                              <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse"></div>
                              <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest">Active</span>
                            </div>
                          )}
                        </div>
                        <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">S1 • HD Stream</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!selectedAnime && !isSearching && !isInitialLoading && searchResults.length === 0 && (
          <div className="text-center py-52 space-y-10">
             <div className="relative inline-block">
                <div className="absolute inset-0 bg-blue-500/20 blur-[100px] animate-pulse"></div>
                <div className="relative p-14 bg-slate-900 rounded-[3.5rem] border border-white/5 shadow-3xl">
                   <PlayIcon size={80} className="text-blue-500" />
                </div>
             </div>
             <div className="space-y-4">
               <h2 className="text-7xl font-black tracking-tighter">ZENITH <span className="text-slate-700">PLAYER</span></h2>
               <p className="text-slate-500 font-black text-xs uppercase tracking-[0.6em]">Encrypted AES-128 Playback Engine • Secure Matrix</p>
             </div>
             <button onClick={() => {setSearchQuery('Naruto'); handleSearch();}} className="bg-blue-600 hover:bg-blue-500 px-14 py-6 rounded-full text-[10px] font-black uppercase tracking-[0.4em] transition-all shadow-2xl shadow-blue-600/30">
               Initialize Hub
             </button>
          </div>
        )}
          </>
        )}
      </main>

      <footer className="border-t border-white/5 py-10 opacity-30">
        <div className="container mx-auto px-6 text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.6em]">Zenith Streaming Matrix &bull; Security Protocol Active</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
