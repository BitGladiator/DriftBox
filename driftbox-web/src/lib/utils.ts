export const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const formatDate = (date: string): string => {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(date));
};

export const getFileIcon = (mimeType: string): string => {
  if (!mimeType) return '📁';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('zip') || mimeType.includes('tar')) return '📦';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('text/')) return '📃';
  if (mimeType.includes('javascript') || mimeType.includes('json')) return '💻';
  return '📁';
};

export const getFileColors = (mimeType: string) => {
  if (!mimeType) return { bg: '#f3f4f6', color: '#374151' };
  if (mimeType.startsWith('image/')) return { bg: '#fce7f3', color: '#be185d' };
  if (mimeType.startsWith('video/')) return { bg: '#ede9fe', color: '#6d28d9' };
  if (mimeType.startsWith('audio/')) return { bg: '#fef9c3', color: '#a16207' };
  if (mimeType.includes('pdf'))      return { bg: '#fee2e2', color: '#b91c1c' };
  if (mimeType.includes('zip'))      return { bg: '#ffedd5', color: '#c2410c' };
  if (mimeType.includes('text/') || mimeType.includes('document')) return { bg: '#dbeafe', color: '#1d4ed8' };
  if (mimeType.includes('javascript') || mimeType.includes('json')) return { bg: '#dcfce7', color: '#15803d' };
  return { bg: '#f3f4f6', color: '#374151' };
};

export const CHUNK_SIZE = 4 * 1024 * 1024;

export const splitIntoChunks = (file: File): Blob[] => {
  const chunks: Blob[] = [];
  let offset = 0;
  while (offset < file.size) {
    chunks.push(file.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }
  return chunks;
};