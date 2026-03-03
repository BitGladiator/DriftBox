'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { Cloud, Eye, EyeOff, ArrowRight, Loader2, Zap, RefreshCw, Link2, FolderOpen } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      const { data } = await authApi.signup(email, password);
      setAuth(data.user, data.tokens.accessToken, data.tokens.refreshToken);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Zap, label: 'Chunked uploads', desc: 'Large files upload reliably with auto-resume', color: '#dfab01', bg: '#fef9c3' },
    { icon: RefreshCw, label: 'Real-time sync', desc: 'Files appear instantly across all devices', color: '#2383e2', bg: '#dbeafe' },
    { icon: Link2, label: 'Easy sharing', desc: 'Share with a link, set expiry dates', color: '#9065b0', bg: '#ede9fe' },
    { icon: FolderOpen, label: 'Version history', desc: 'Every version saved, restore anytime', color: '#0f7b6c', bg: '#dcfce7' },
  ];

  const inputStyle = (field: string) => ({
    width: '100%', padding: '10px 14px',
    borderRadius: 10, fontSize: 14,
    border: `1.5px solid ${focusedField === field ? '#2383e2' : '#e8e8e6'}`,
    background: '#f7f6f3', color: '#1a1a1a',
    outline: 'none', transition: 'border-color 0.15s',
    boxSizing: 'border-box' as const,
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#ffffff', fontFamily: "'Sora', sans-serif" }}>

      {/* Left panel */}
      <div style={{
        width: 460, flexShrink: 0,
        background: '#f7f6f3', borderRight: '1px solid #e8e8e6',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '48px 40px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#2383e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cloud size={18} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#1a1a1a', letterSpacing: '-0.3px' }}>DriftBox</span>
        </div>

        <div>
          <p style={{ fontSize: 13, color: '#9b9b9b', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            What you get
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {features.map(({ icon: Icon, label, desc, color, bg }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color={color} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 2 }}>{label}</p>
                  <p style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.5 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: '#9b9b9b' }}>© 2024 DriftBox · Built with ❤️ by BitGladiator</p>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', marginBottom: 6, letterSpacing: '-0.5px' }}>
            Create an account
          </h1>
          <p style={{ fontSize: 14, color: '#6b6b6b', marginBottom: 32 }}>
            Start storing and syncing your files for free
          </p>

          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Email</label>
              <input
                type="email" value={email} required placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                style={inputStyle('email')}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'} value={password} required placeholder="Min. 8 characters"
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  style={{ ...inputStyle('password'), paddingRight: 40 }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9b9b9b', padding: 0 }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Confirm password</label>
              <input
                type="password" value={confirm} required placeholder="Repeat your password"
                onChange={(e) => setConfirm(e.target.value)}
                onFocus={() => setFocusedField('confirm')}
                onBlur={() => setFocusedField(null)}
                style={inputStyle('confirm')}
              />
            </div>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#b91c1c', fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '11px 20px', borderRadius: 10,
              fontSize: 14, fontWeight: 600, background: loading ? '#93c5fd' : '#2383e2',
              color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.15s', marginTop: 4,
            }}>
              {loading && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
              {loading ? 'Creating account...' : 'Create account'}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e8e8e6' }} />
            <span style={{ fontSize: 12, color: '#9b9b9b' }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#e8e8e6' }} />
          </div>

          <p style={{ fontSize: 13, textAlign: 'center', color: '#6b6b6b' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#2383e2', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #9b9b9b; }
      `}</style>
    </div>
  );
}