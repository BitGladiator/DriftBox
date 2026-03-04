'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { Cloud, Eye, EyeOff, ArrowRight, Loader2, Zap, RefreshCw, Link2, FolderOpen } from 'lucide-react';

const FEATURES = [
  { icon: Zap,        label: 'Chunked uploads',  desc: 'Large files upload reliably with auto-resume',  iconColor: '#dfab01', iconBg: '#fef9c3' },
  { icon: RefreshCw,  label: 'Real-time sync',   desc: 'Files appear instantly across all devices',     iconColor: '#2383e2', iconBg: '#dbeafe' },
  { icon: Link2,      label: 'Easy sharing',     desc: 'Share with a link, set expiry dates',           iconColor: '#9065b0', iconBg: '#ede9fe' },
  { icon: FolderOpen, label: 'Version history',  desc: 'Every version saved, restore anytime',          iconColor: '#0f7b6c', iconBg: '#dcfce7' },
];

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useStore((s) => s.setAuth);
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [focused, setFocused]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      setAuth(data.user, data.tokens.accessToken, data.tokens.refreshToken);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
    border: '1.5px solid ' + (focused === field ? '#2383e2' : '#e8e8e6'),
    background: '#f7f6f3', color: '#1a1a1a', outline: 'none',
    transition: 'border-color 0.15s', boxSizing: 'border-box',
    fontFamily: "'Sora', sans-serif",
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Sora', sans-serif" }}>

      {/* ── Left panel ── */}
      <div style={{ width: 460, flexShrink: 0, background: '#f7f6f3', borderRight: '1px solid #e8e8e6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 40px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#2383e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cloud size={18} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#1a1a1a', letterSpacing: '-0.3px' }}>DriftBox</span>
        </div>

        {/* Features */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 24 }}>
            What you get
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {FEATURES.map(({ icon: Icon, label, desc, iconColor, iconBg }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color={iconColor} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>{label}</p>
                  <p style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.5 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: '#9b9b9b' }}>© 2024 DriftBox · Built with ❤️ by BitGladiator</p>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: '#ffffff' }}>
        <div style={{ width: '100%', maxWidth: 360, animation: 'fadeIn 0.3s ease' }}>

          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.5px', marginBottom: 6 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: '#6b6b6b', marginBottom: 32 }}>
            Sign in to your DriftBox account
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Email</label>
              <input
                type="email" value={email} required placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused('')}
                style={inputStyle('email')}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} value={password} required placeholder="••••••••"
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')} onBlur={() => setFocused('')}
                  style={{ ...inputStyle('password'), paddingRight: 42 }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9b9b9b', padding: 0, display: 'flex', alignItems: 'center' }}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#b91c1c', fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: loading ? '#93c5fd' : '#2383e2', color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, transition: 'background 0.15s' }}>
              {loading && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e8e8e6' }} />
            <span style={{ fontSize: 12, color: '#9b9b9b' }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#e8e8e6' }} />
          </div>

          <p style={{ fontSize: 13, textAlign: 'center', color: '#6b6b6b' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" style={{ color: '#2383e2', fontWeight: 600 }}>Create one free</Link>
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}