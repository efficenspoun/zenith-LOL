
import { ANILIST_API_BASE } from '../constants';

export const getAniListAuthUrl = (clientId: string, redirectUri: string) => {
  return `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token`;
};

const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (_key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      // Explicitly check for DOM nodes which are common sources of circularity in React
      if (value instanceof Node) {
        return "[DOM Node]";
      }
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
};

export const searchByMalId = async (malId: number) => {
  const query = `
    query ($malId: Int) {
      Media (idMal: $malId, type: ANIME) {
        id
        title {
          romaji
          english
        }
      }
    }
  `;

  const variables = { malId };
  const body = JSON.stringify({ query, variables }, getCircularReplacer());

  const response = await fetch(ANILIST_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body
  });

  const data = await response.json();
  return data?.data?.Media;
};

export const updateAniListProgress = async (token: string, malId: number, progress: number) => {
  try {
    // First find the AniList ID using MAL ID
    const media = await searchByMalId(malId);
    if (!media || !media.id) {
      console.warn(`Could not find AniList entry for MAL ID: ${malId}`);
      return null;
    }

    const query = `
      mutation ($mediaId: Int, $progress: Int) {
        SaveMediaListEntry (mediaId: $mediaId, progress: $progress) {
          id
          progress
        }
      }
    `;

    const variables = { mediaId: media.id, progress };
    const body = JSON.stringify({ query, variables }, getCircularReplacer());

    const response = await fetch(ANILIST_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body
    });

    return response.json();
  } catch (err) {
    console.error("AniList progress sync error:", err);
    return null;
  }
};

export const fetchViewer = async (token: string) => {
  const query = `
    query {
      Viewer {
        id
        name
        avatar {
          large
        }
      }
    }
  `;

  const body = JSON.stringify({ query }, getCircularReplacer());

  const response = await fetch(ANILIST_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body
  });

  const data = await response.json();
  if (!data?.data?.Viewer) {
    console.warn("AniList Viewer data not found in response");
    return null;
  }
  return data.data.Viewer;
};
