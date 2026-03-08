'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { useStore } from '@/store/useStore';

export default function RealtimeSync() {
  const { accessToken, addNotification } = useStore();
  const qc = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket();

    socket.on('file:uploaded', (data: any) => {
      qc.invalidateQueries({ queryKey: ['files'] });
      addNotification({ type: 'upload', message: data.fileName + ' uploaded successfully' });
    });

    socket.on('file:deleted', (data: any) => {
      qc.invalidateQueries({ queryKey: ['files'] });
      addNotification({ type: 'sync', message: (data.fileName ?? 'File') + ' deleted' });
    });

    socket.on('file:synced', (data: any) => {
      qc.invalidateQueries({ queryKey: ['files'] });
      addNotification({ type: 'sync', message: data.fileName + ' synced from another device' });
    });

    socket.on('file:shared', (data: any) => {
      addNotification({ type: 'share', message: data.sharedBy + ' shared "' + data.fileName + '" with you' });
    });

    return () => {
      socket.off('file:uploaded');
      socket.off('file:deleted');
      socket.off('file:synced');
      socket.off('file:shared');
    };
  }, [accessToken, qc]);

  return null;
}