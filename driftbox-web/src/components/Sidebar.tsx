'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Cloud, LayoutDashboard, Upload, Share2, Moon, Sun, LogOut, HardDrive } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { authApi } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { formatBytes } from '@/lib/utils';
import { getTheme } from '@/lib/theme';

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, clearAuth, theme, toggleTheme } = useStore();
  const t = getTheme(theme === 'dark');

  const logout = async () => {
    const rt = localStorage.getItem('refreshToken');
    if (rt) { try { await authApi.logout(rt); } catch {} }
    disconnectSocket();
    clearAuth();
    router.push('/login');
  };

  const pct = user && user.storageQuota 
    ? Math.min(user.storageUsed > 0 ? Math.max(1, Math.round((user.storageUsed / user.storageQuota) * 100)) : 0, 100) 
    : 0;

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Files' },
    { href: '/upload', icon: Upload,label: 'Upload' },
    { href: '/shared', icon: Share2,label: 'Shared' },
  ];

  const navBtn = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 8, textDecoration: 'none',
    background: active ? t.bgHover : 'transparent',
    color: active ? t.text : t.textSecondary,
    fontWeight: active ? 600 : 400, fontSize: 14,
    transition: 'background 0.15s',
  });

  const plainBtn: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 8, border: 'none',
    background: 'transparent', color: t.textSecondary,
    fontSize: 14, cursor: 'pointer', fontFamily: "'Sora', sans-serif",
  };

  return (
    <aside style={{ width: 220, flexShrink: 0, height: '100vh', background: t.bgSecondary, borderRight: '1px solid ' + t.border, display: 'flex', flexDirection: 'column', fontFamily: "'Sora', sans-serif", transition: 'background 0.2s' }}>


      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '22px 16px 12px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#2383e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Cloud size={15} color="white" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 16, color: t.text, letterSpacing: '-0.3px' }}>DriftBox</span>
      </div>


      <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href} style={navBtn(active)}>
              <Icon size={15} /> {label}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div style={{ margin: '0 8px 8px', padding: 12, borderRadius: 10, background: t.bgHover }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <HardDrive size={12} color={t.textMuted} />
              <span style={{ fontSize: 12, color: t.textSecondary }}>Storage</span>
            </div>
            <span style={{ fontSize: 11, color: t.textMuted }}>{pct}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: t.border, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, width: pct + '%', background: 'linear-gradient(90deg, #2383e2, #9065b0)', transition: 'width 0.5s' }} />
          </div>
          <p style={{ fontSize: 11, color: t.textMuted, marginTop: 5 }}>
            {formatBytes(user.storageUsed)} of {formatBytes(user.storageQuota)}
          </p>
        </div>
      )}

      <div style={{ borderTop: '1px solid ' + t.border, padding: 8 }}>
        <button onClick={toggleTheme} style={plainBtn}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={logout} style={plainBtn}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid ' + t.border }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#9065b0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {user.email[0].toUpperCase()}
          </div>
          <p style={{ fontSize: 12, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </p>
        </div>
      )}
    </aside>
  );
}