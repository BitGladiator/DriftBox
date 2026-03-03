import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('zip') || mimeType.includes('tar')) return '📦';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊';
  if (mimeType.includes('text/')) return '📃';
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html')) return '💻';
  return '📁';
};

export const getFileColor = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300';
  if (mimeType.startsWith('video/')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
  if (mimeType.startsWith('audio/')) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
  if (mimeType.includes('pdf')) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  if (mimeType.includes('zip') || mimeType.includes('tar')) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
  if (mimeType.includes('text/') || mimeType.includes('document')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  if (mimeType.includes('javascript') || mimeType.includes('json')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
};

export const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB

export const splitIntoChunks = (file: File): Blob[] => {
  const chunks: Blob[] = [];
  let offset = 0;
  while (offset < file.size) {
    chunks.push(file.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }
  return chunks;
};