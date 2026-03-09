import axios from 'axios';

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3001';
const UPLOAD_URL = process.env.NEXT_PUBLIC_UPLOAD_URL || 'http://localhost:3002';
const METADATA_URL = process.env.NEXT_PUBLIC_METADATA_URL || 'http://localhost:3003';
const SHARE_URL = process.env.NEXT_PUBLIC_SHARE_URL || 'http://localhost:3005';

const makeClient = (baseURL: string) => {
  const client = axios.create({ baseURL });

  client.interceptors.request.use((config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (token) config.headers.Authorization = 'Bearer ' + token;
    return config;
  });

  client.interceptors.response.use(
    (res) => res,
    async (err) => {
      if (err.response?.status === 401) {
        try {
          const rt = localStorage.getItem('refreshToken');
          if (!rt) throw new Error('no token');
          const { data } = await axios.post(AUTH_URL + '/auth/refresh', { refreshToken: rt });
          localStorage.setItem('accessToken', data.tokens.accessToken);
          localStorage.setItem('refreshToken', data.tokens.refreshToken);
          err.config.headers.Authorization = 'Bearer ' + data.tokens.accessToken;
          return client(err.config);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
      return Promise.reject(err);
    }
  );
  return client;
};

const authClient = makeClient(AUTH_URL);
const uploadClient = makeClient(UPLOAD_URL);
const metadataClient = makeClient(METADATA_URL);
const shareClient = makeClient(SHARE_URL);

export const authApi = {
  signup:  (email: string, password: string) => authClient.post('/auth/signup', { email, password }),
  login:   (email: string, password: string) => authClient.post('/auth/login',  { email, password }),
  logout:  (refreshToken: string)            => authClient.post('/auth/logout', { refreshToken }),
  me:      ()                                => authClient.get('/auth/me'),
  refresh: (refreshToken: string)            => authClient.post('/auth/refresh', { refreshToken }),
};

export const uploadApi = {
  init: (fileName: string, fileSize: number, mimeType: string, folderPath = '/') =>
    uploadClient.post('/upload/init', { fileName, fileSize, mimeType, folderPath }),
  chunk: (sessionId: string, chunkIndex: number, chunk: Blob) => {
    const form = new FormData();
    form.append('sessionId', sessionId);
    form.append('chunkIndex', String(chunkIndex));
    form.append('chunk', chunk);
    return uploadClient.post('/upload/chunk', form);
  },
  complete: (sessionId: string) => uploadClient.post('/upload/complete', { sessionId }),
  download: (fileId: string)    => uploadClient.get('/upload/download/' + fileId),
};

export const metadataApi = {
  listFiles:      (folderPath = '/', page = 1, limit = 50) =>
    metadataClient.get('/files', { params: { folderPath, page, limit } }),
  getFile:        (id: string)                    => metadataClient.get('/files/' + id),
  deleteFile:     (id: string)                    => metadataClient.delete('/files/' + id),
  listVersions:   (id: string)                    => metadataClient.get('/files/' + id + '/versions'),
  restoreVersion: (id: string, versionId: string) => metadataClient.post('/files/' + id + '/restore/' + versionId),
  searchFiles:    (q: string)                     => metadataClient.get('/files/search', { params: { q } }),
};

export const shareApi = {
  createLink: (fileId: string, permission = 'read', expiresInDays?: number) =>
    shareClient.post('/share', { fileId, permission, expiresInDays }),
  accessLink: (linkId: string) => shareClient.get('/share/' + linkId),
  revokeLink: (linkId: string) => shareClient.delete('/share/' + linkId),
  myLinks:    ()               => shareClient.get('/share'),
};