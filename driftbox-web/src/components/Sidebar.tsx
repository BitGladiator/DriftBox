'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Cloud, LayoutDashboard, Upload, Share2, Moon, Sun, LogOut, HardDrive } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { authApi } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { formatBytes } from '@/lib/utils';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, theme, toggleTheme } = useStore();

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) { try { await authApi.logout(refreshToken); } catch {} }
    disconnectSocket();
    clearAuth();
    router.push('/login');
  };

  const storagePercent = user ? Math.min(Math.round((user.storageUsed / user.storageQuota) * 100), 100) : 0;

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Files' },
    { href: '/upload', icon: Upload, label: 'Upload' },
    { href: '/shared', icon: Share2, label: 'Shared' },
  ];

  const bg = theme === 'dark' ? '#191919' : '#ffffff';
  const bgSecondary = theme === 'dark' ? '#222222' : '#f7f6f3';
  const bgHover = theme === 'dark' ? '#2e2e2e' : '#efefef';
  const border = theme === 'dark' ? '#333333' : '#e8e8e6';
  const text = theme === 'dark' ? '#e8e8e6' : '#1a1a1a';
  const textSecondary = theme === 'dark' ? '#9b9b9b' : '#6b6b6b';
  const textMuted = theme === 'dark' ? '#6b6b6b' : '#9b9b9b';

  return (
    <aside style={{
      width: 220, flexShrink: 0, height: '100vh',
      background: bgSecondary, borderRight: `1px solid ${border}`,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Sora', sans-serif",
      transition: 'background 0.2s',
    }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 16px 16px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#2383e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Cloud size={15} color="white" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 16, color: text, letterSpacing: '-0.3px' }}>DriftBox</span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8, textDecoration: 'none',
              background: active ? bgHover : 'transparent',
              color: active ? text : textSecondary,
              fontWeight: active ? 600 : 400, fontSize: 14,
              transition: 'background 0.15s',
            }}>
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Storage */}
      {user && (
        <div style={{ margin: '0 8px 8px', padding: '12px', borderRadius: 10, background: bgHover }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HardDrive size={12} color={textMuted} />
              <span style={{ fontSize: 12, color: textSecondary }}>Storage</span>
            </div>
            <span style={{ fontSize: 11, color: textMuted }}>{storagePercent}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: border, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, width: `${storagePercent}%`, background: 'linear-gradient(90deg, #2383e2, #9065b0)', transition: 'width 0.5s' }} />
          </div>
          <p style={{ fontSize: 11, color: textMuted, marginTop: 6 }}>
            {formatBytes(user.storageUsed)} of {formatBytes(user.storageQuota)}
          </p>
        </div>
      )}

      {/* Bottom actions */}
      <div style={{ borderTop: `1px solid ${border}`, padding: '8px' }}>
        <button onClick={toggleTheme} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 8, border: 'none',
          background: 'transparent', color: textSecondary, fontSize: 14,
          cursor: 'pointer', textAlign: 'left',
        }}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={handleLogout} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 8, border: 'none',
          background: 'transparent', color: textSecondary, fontSize: 14,
          cursor: 'pointer', textAlign: 'left',
        }}>
          <LogOut size={15} />
          Sign out
        </button>
      </div>

      {/* User */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: `1px solid ${border}` }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: '#9065b0', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
          }}>
            {user.email[0].toUpperCase()}
          </div>
          <p style={{ fontSize: 12, color: textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </p>
        </div>
      )}
    </aside>
  );
}