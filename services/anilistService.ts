
import { ANILIST_API_BASE } from '../constants';

export const getAniListAuthUrl = (clientId: string, redirectUri: string) => {
  return `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token`;
};

const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (_key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
};

export const updateAniListProgress = async (token: string, mediaId: number, progress: number) => {
  const query = `
    mutation ($mediaId: Int, $progress: Int) {
      SaveMediaListEntry (mediaId: $mediaId, progress: $progress) {
        id
        progress
      }
    }
  `;

  const variables = { mediaId, progress };

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
  return data.data.Viewer;
};
