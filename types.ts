
export interface Anime {
  mal_id: number;
  title: string;
  title_english?: string;
  images: {
    jpg: {
      large_image_url: string;
      image_url: string;
    }
  };
  synopsis: string;
  score: number;
  episodes: number;
  status: string;
  year: number;
}

export interface Episode {
  mal_id: number;
  title: string;
  episode_id: string; 
  number: number;
  thumbnail?: string;
  aired?: string;
}

export interface ApiSubtitle {
  url: string;
  label: string;
}

export interface ApiSource {
  url: string;
  server: string;
  type: string;
  subtitles: ApiSubtitle[];
}

export interface ApiResponse {
  status: string;
  jikanSource: {
    id: number;
    title: string;
    type: string;
    approved: boolean;
    episodes: number;
    year: number;
  };
  bestMatch: {
    id: string;
    title: string;
    poster: string;
    score: number;
    matchDetails: Record<string, boolean>;
  };
  sources: ApiSource[];
}

export enum SourceType {
  DIRECT = 'direct',
  EMBED = 'embed'
}

export type SourceCategory = 'hardsub' | 'softsub' | 'dub';

export interface SourcePlugin {
  id: string;
  provider: string;
  name: string;
  label: string;
  type: SourceType;
  category: SourceCategory;
  url: string; 
  keyUrl?: string;
  getVideoUrlTemplate?: string;
  priority: number;
  requiresCorsProxy: boolean;
}

export interface SourceResult {
  url: string;
  keyUrl?: string;
  type: SourceType;
  provider: string;
  pluginName: string;
  label: string;
  category: SourceCategory;
  subtitles?: ApiSubtitle[];
  metadata?: Record<string, any>;
  rawSource?: any;
}

export interface User {
  id: number;
  name: string;
  avatar: string;
}
