'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shareApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { getTheme } from '@/lib/theme';
import { formatDate } from '@/lib/utils';
import { Link2, Trash2, Clock, Copy, ExternalLink } from 'lucide-react';

export default function SharedPage() {
  const qc = useQueryClient();
  const { addNotification, theme } = useStore();
  const t = getTheme(theme === 'dark');

  const { data, isLoading } = useQuery({
    queryKey: ['my-links'],
    queryFn: () => shareApi.myLinks(),
    select: (r) => r.data,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => shareApi.revokeLink(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-links'] }); addNotification({ type: 'sync', message: 'Share link revoked' }); },
  });

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    addNotification({ type: 'share', message: 'Link copied to clipboard!' });
  };

  const links = data?.links ?? [];

  return (
    <div style={{ padding: 32, background: t.bg, minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, letterSpacing: '-0.4px', marginBottom: 2 }}>Shared Links</h1>
        <p style={{ fontSize: 13, color: t.textSecondary }}>{links.length} active link{links.length !== 1 ? 's' : ''}</p>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 64, borderRadius: 12, background: t.bgSecondary, opacity: 0.6 }} />
          ))}
        </div>
      )}

      {!isLoading && links.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Link2 size={36} color="#6d28d9" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 6 }}>No shared links yet</p>
          <p style={{ fontSize: 13, color: t.textSecondary }}>Go to Files and share a file to see links here</p>
        </div>
      )}

      {!isLoading && links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {links.map((link: any) => (
            <div key={link.link_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, background: t.bgSecondary, border: '1px solid ' + t.border }}>

             
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Link2 size={16} color="#6d28d9" />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {link.file_name ?? 'Shared file'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={10} /> Created {formatDate(link.created_at)}
                  </span>
                  {link.expires_at && (
                    <span style={{ fontSize: 11, color: '#d9730d' }}>
                      Expires {formatDate(link.expires_at)}
                    </span>
                  )}
                  <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>
                    {link.permission}
                  </span>
                </div>
              </div>

            
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => copyLink(link.url)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid ' + t.border, background: 'transparent', color: t.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: "'Sora', sans-serif" }}>
                  <Copy size={12} /> Copy
                </button>
                <a href={link.url} target="_blank" rel="noreferrer"
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid ' + t.border, background: 'transparent', color: t.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: "'Sora', sans-serif", textDecoration: 'none' }}>
                  <ExternalLink size={12} /> Open
                </a>
                <button onClick={() => revokeMutation.mutate(link.link_id)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fecaca', background: 'transparent', color: '#b91c1c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: "'Sora', sans-serif" }}>
                  <Trash2 size={12} /> Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}