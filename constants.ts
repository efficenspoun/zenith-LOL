
import { SourcePlugin, SourceType } from './types';

export const JIKAN_API_BASE = 'https://api.jikan.moe/v4';
export const ANILIST_API_BASE = 'https://graphql.anilist.co';
export const ANILIST_CLIENT_ID = '22153';
export const ZENITH_API_BASE = 'https://reverent-albattani-production.up.railway.app';

export const DEFAULT_PLUGINS: SourcePlugin[] = [
  {
    id: 'kuudere-sub',
    provider: 'Kuudere',
    name: 'Kuudere Stream',
    label: 'Kuudere (Sub)',
    type: SourceType.DIRECT,
    category: 'softsub',
    url: '', 
    priority: 1,
    requiresCorsProxy: false
  },
  {
    id: 'kuudere-dub',
    provider: 'Kuudere',
    name: 'Kuudere Stream',
    label: 'Kuudere (Dub)',
    type: SourceType.DIRECT,
    category: 'dub',
    url: '', 
    priority: 2,
    requiresCorsProxy: false
  },
  {
    id: 'allmanga-sub',
    provider: 'AllManga',
    name: 'AllManga Stream',
    label: 'AllManga (Sub)',
    type: SourceType.DIRECT,
    category: 'softsub',
    url: '', 
    priority: 3,
    requiresCorsProxy: false
  },
  {
    id: 'allmanga-dub',
    provider: 'AllManga',
    name: 'AllManga Stream',
    label: 'AllManga (Dub)',
    type: SourceType.DIRECT,
    category: 'dub',
    url: '', 
    priority: 4,
    requiresCorsProxy: false
  },
  {
    id: 'anizone-sub',
    provider: 'Anizone',
    name: 'Anizone Stream',
    label: 'Anizone (Sub)',
    type: SourceType.DIRECT,
    category: 'softsub',
    url: '',
    priority: 5,
    requiresCorsProxy: false
  }
];
