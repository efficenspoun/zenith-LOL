
import { SourcePlugin, SourceType, SourceResult, Anime } from '../types';
import { getZenithSources } from './zenithService';

export const resolveSource = async (
  plugin: SourcePlugin,
  malId: number,
  episodeNumber: number,
  animeContext?: Anime
): Promise<SourceResult[]> => {
  // Use Zenith API for Kuudere and AllManga providers
  if (plugin.provider === 'Kuudere' || plugin.provider === 'AllManga') {
    const sources = await getZenithSources(malId, episodeNumber, plugin.category, plugin.provider, animeContext);
    if (sources.length > 0) return sources;
  }

  // Fallback/Existing Logic
  if (plugin.type === SourceType.EMBED) {
    const url = (plugin.getVideoUrlTemplate || plugin.url)
      .replace('{animeId}', malId.toString())
      .replace('{episodeNumber}', episodeNumber.toString());
    
    return [{
      url,
      type: SourceType.EMBED,
      provider: plugin.provider,
      pluginName: plugin.name,
      label: plugin.label,
      category: plugin.category
    }];
  }

  // Demo fallback
  if (!plugin.url) return [];

  return [{
    url: plugin.url,
    keyUrl: plugin.keyUrl,
    type: SourceType.DIRECT,
    provider: plugin.provider,
    pluginName: plugin.name,
    label: plugin.label,
    category: plugin.category
  }];
};
