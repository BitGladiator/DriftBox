'use client';

import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useStore } from '@/store/useStore';

export default function RealtimeSync() {
  const { accessToken, addFile, addNotification } = useStore();

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket();

    socket.on('file:uploaded', (data: any) => {
      addFile({ file_id: data.fileId, name: data.fileName, folder_path: '/', size: data.fileSize, mime_type: 'application/octet-stream', created_at: data.uploadedAt, updated_at: data.uploadedAt });
      addNotification({ type: 'upload', message: data.fileName + ' uploaded successfully' });
    });

    socket.on('file:synced', (data: any) => {
      addNotification({ type: 'sync', message: data.fileName + ' synced from another device' });
    });

    socket.on('file:shared', (data: any) => {
      addNotification({ type: 'share', message: data.sharedBy + ' shared "' + data.fileName + '" with you' });
    });

    return () => {
      socket.off('file:uploaded');
      socket.off('file:synced');
      socket.off('file:shared');
    };
  }, [accessToken]);

  return null;
}