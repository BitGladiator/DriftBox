import { create } from 'zustand';

export interface User {
  userId: string;
  email: string;
  storageUsed: number;
  storageQuota: number;
}

export interface FileItem {
  file_id: string;
  name: string;
  folder_path: string;
  size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

interface Notification {
  id: string;
  type: 'upload' | 'sync' | 'share' | 'error';
  message: string;
  timestamp: number;
}

interface Store {
  // Auth
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;

  // Files
  files: FileItem[];
  setFiles: (files: FileItem[]) => void;
  addFile: (file: FileItem) => void;
  removeFile: (fileId: string) => void;
  currentFolder: string;
  setCurrentFolder: (folder: string) => void;

  // Upload
  uploadProgress: Record<string, number>;
  setUploadProgress: (sessionId: string, progress: number) => void;
  clearUploadProgress: (sessionId: string) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;

  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const useStore = create<Store>((set) => ({
  // Auth
  user: null,
  accessToken: null,
  refreshToken: null,
  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, accessToken, refreshToken });
  },
  clearAuth: () => {
    localStorage.clear();
    set({ user: null, accessToken: null, refreshToken: null });
  },

  // Files
  files: [],
  setFiles: (files) => set({ files }),
  addFile: (file) => set((s) => ({ files: [file, ...s.files] })),
  removeFile: (fileId) =>
    set((s) => ({ files: s.files.filter((f) => f.file_id !== fileId) })),
  currentFolder: '/',
  setCurrentFolder: (folder) => set({ currentFolder: folder }),

  // Upload
  uploadProgress: {},
  setUploadProgress: (sessionId, progress) =>
    set((s) => ({ uploadProgress: { ...s.uploadProgress, [sessionId]: progress } })),
  clearUploadProgress: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.uploadProgress;
      return { uploadProgress: rest };
    }),

  // Notifications
  notifications: [],
  addNotification: (n) =>
    set((s) => ({
      notifications: [
        { ...n, id: crypto.randomUUID(), timestamp: Date.now() },
        ...s.notifications.slice(0, 9),
      ],
    })),
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  // Theme
  theme: 'light',
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
}));