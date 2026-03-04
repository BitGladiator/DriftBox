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

export interface Notification {
  id: string;
  type: 'upload' | 'sync' | 'share' | 'error';
  message: string;
}

interface Store {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;

  files: FileItem[];
  setFiles: (files: FileItem[]) => void;
  addFile: (file: FileItem) => void;
  removeFile: (fileId: string) => void;

  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;

  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const useStore = create<Store>((set) => ({
  user: null,
  accessToken: null,

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, accessToken });
  },
  clearAuth: () => {
    localStorage.clear();
    set({ user: null, accessToken: null });
  },

  files: [],
  setFiles: (files) => set({ files }),
  addFile:  (file)  => set((s) => ({ files: [file, ...s.files] })),
  removeFile: (id)  => set((s) => ({ files: s.files.filter((f) => f.file_id !== id) })),

  notifications: [],
  addNotification: (n) => set((s) => ({
    notifications: [{ ...n, id: crypto.randomUUID() }, ...s.notifications.slice(0, 4)],
  })),
  removeNotification: (id) => set((s) => ({
    notifications: s.notifications.filter((n) => n.id !== id),
  })),

  theme: 'light',
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
}));