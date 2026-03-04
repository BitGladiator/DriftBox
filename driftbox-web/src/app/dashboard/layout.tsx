'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { getTheme } from '@/lib/theme';
import Sidebar from '@/components/Sidebar';
import RealtimeSync from '@/components/RealtimeSync';
import NotificationToast from '@/components/NotificationToast';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, theme } = useStore();
  const t = getTheme(theme === 'dark');

  useEffect(() => {
    const token = accessToken || localStorage.getItem('accessToken');
    if (!token) router.push('/login');
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: t.bg, fontFamily: "'Sora', sans-serif" }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: t.bg }}>
        {children}
      </main>
      <RealtimeSync />
      <NotificationToast />
    </div>
  );
}