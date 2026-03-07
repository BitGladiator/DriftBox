'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { metadataApi, shareApi, uploadApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { getTheme } from '@/lib/theme';
import { formatBytes, formatDate, getFileIconComponent, getFileColors } from '@/lib/utils';
import { Search, Upload, Trash2, Share2, Grid3X3, List, RefreshCw, Download, X, Link2, FolderOpen } from 'lucide-react';

export default function DashboardPage() {
  const router       = useRouter();
  const qc           = useQueryClient();
  const { addNotification, theme } = useStore();
  const t            = getTheme(theme === 'dark');
  const [search, setSearch]       = useState('');
  const [view, setView]           = useState<'grid' | 'list'>('grid');
  const [selected, setSelected]   = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['files'],
    queryFn: () => metadataApi.listFiles('/'),
    select: (r) => r.data,
  });

  const { data: searchData } = useQuery({
    queryKey: ['search', search],
    queryFn: () => metadataApi.searchFiles(search),
    enabled: search.length > 1,
    select: (r) => r.data,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => metadataApi.deleteFile(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['files'] }); addNotification({ type: 'sync', message: 'File deleted' }); setSelected(null); },
  });

  const shareMutation = useMutation({
    mutationFn: (id: string) => shareApi.createLink(id, 'read', 7),
    onSuccess: (res) => { navigator.clipboard.writeText(res.data.link.url); addNotification({ type: 'share', message: 'Share link copied!' }); },
  });

  const downloadMutation = useMutation({
    mutationFn: async (id: string) => { const r = await uploadApi.download(id); window.open(r.data.url, '_blank'); },
  });

  const files = search.length > 1 ? searchData?.results : data?.files;

  // ── Shared styles ──────────────────────────────────────────
  const card = (isSelected: boolean): React.CSSProperties => ({
    padding: 16, borderRadius: 12, cursor: 'pointer', position: 'relative',
    background: isSelected ? t.bgHover : t.bgSecondary,
    border: '1.5px solid ' + (isSelected ? '#2383e2' : t.border),
    transition: 'border-color 0.15s, background 0.15s',
  });

  const iconBtn = (bg: string, color: string): React.CSSProperties => ({
    width: 26, height: 26, borderRadius: 7, border: 'none',
    background: bg, color, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  const actionBtn: React.CSSProperties = {
    padding: '5px 8px', borderRadius: 7, border: '1px solid ' + t.border,
    background: 'transparent', color: t.textSecondary, cursor: 'pointer',
    display: 'flex', alignItems: 'center',
  };

  return (
    <div style={{ padding: 32, background: t.bg, minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, letterSpacing: '-0.4px', marginBottom: 2 }}>My Files</h1>
          <p style={{ fontSize: 13, color: t.textSecondary }}>{data?.total ?? 0} files</p>
        </div>
        <button onClick={() => router.push('/upload')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: 'none', background: '#2383e2', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora', sans-serif" }}>
          <Upload size={14} /> Upload
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 320, padding: '8px 12px', borderRadius: 10, border: '1.5px solid ' + t.border, background: t.bgSecondary }}>
          <Search size={13} color={t.textMuted} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files..."
            style={{ flex: 1, fontSize: 13, border: 'none', outline: 'none', background: 'transparent', color: t.text, fontFamily: "'Sora', sans-serif" }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, padding: 0, display: 'flex' }}><X size={12} /></button>}
        </div>

        <button onClick={() => refetch()} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid ' + t.border, background: t.bgSecondary, color: t.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <RefreshCw size={13} />
        </button>

        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid ' + t.border }}>
          {(['grid', 'list'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '8px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', background: view === v ? t.bgHover : t.bgSecondary, color: view === v ? t.text : t.textMuted }}>
              {v === 'grid' ? <Grid3X3 size={13} /> : <List size={13} />}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ height: 100, borderRadius: 12, background: t.bgSecondary, opacity: 0.6 }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !files?.length && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(35,131,226,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <FolderOpen size={36} color="#2383e2" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 6 }}>No files yet</p>
          <p style={{ fontSize: 13, color: t.textSecondary, marginBottom: 24 }}>Upload your first file to get started</p>
          <button onClick={() => router.push('/upload')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: 'none', background: '#2383e2', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora', sans-serif" }}>
            <Upload size={14} /> Upload files
          </button>
        </div>
      )}

      {/* Grid view */}
      {!isLoading && !!files?.length && view === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {files.map((file: any) => {
            const { bg: iBg, color: iColor } = getFileColors(file.mime_type);
            const { Icon: FileIcon, color: fileIconColor } = getFileIconComponent(file.mime_type);
            const isSel = selected === file.file_id;
            return (
              <div key={file.file_id} onClick={() => setSelected(isSel ? null : file.file_id)} style={card(isSel)}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: iBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <FileIcon size={20} color={fileIconColor} />
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                <p style={{ fontSize: 11, color: t.textMuted }}>{formatBytes(file.size)}</p>

                {isSel && (
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                    <button onClick={(e) => { e.stopPropagation(); shareMutation.mutate(file.file_id); }} style={iconBtn('#dbeafe', '#1d4ed8')}><Link2 size={10} /></button>
                    <button onClick={(e) => { e.stopPropagation(); downloadMutation.mutate(file.file_id); }} style={iconBtn('#dcfce7', '#15803d')}><Download size={10} /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(file.file_id); }} style={iconBtn('#fee2e2', '#b91c1c')}><Trash2 size={10} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {!isLoading && !!files?.length && view === 'list' && (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid ' + t.border }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: t.bgSecondary, borderBottom: '1px solid ' + t.border }}>
                {['Name', 'Size', 'Modified', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: t.textMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {files.map((file: any) => {
                const { bg: iBg } = getFileColors(file.mime_type);
                const { Icon: ListFileIcon, color: listIconColor } = getFileIconComponent(file.mime_type);
                return (
                  <tr key={file.file_id} style={{ borderBottom: '1px solid ' + t.border }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: iBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <ListFileIcon size={14} color={listIconColor} />
                        </div>
                        <span style={{ fontWeight: 500, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{file.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: t.textSecondary }}>{formatBytes(file.size)}</td>
                    <td style={{ padding: '10px 16px', color: t.textSecondary }}>{formatDate(file.updated_at)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => shareMutation.mutate(file.file_id)} style={actionBtn}><Share2 size={12} /></button>
                        <button onClick={() => downloadMutation.mutate(file.file_id)} style={actionBtn}><Download size={12} /></button>
                        <button onClick={() => deleteMutation.mutate(file.file_id)} style={{ ...actionBtn, color: '#b91c1c', borderColor: '#fecaca' }}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}