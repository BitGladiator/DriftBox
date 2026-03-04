'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { uploadApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { getTheme } from '@/lib/theme';
import { splitIntoChunks, formatBytes, getFileIcon } from '@/lib/utils';
import { ArrowLeft, CloudUpload, Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const { addNotification, theme } = useStore();
  const t = getTheme(theme === 'dark');
  const [files, setFiles]       = useState<UploadFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef                = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).map((file) => ({
      id: crypto.randomUUID(), file,
      status: 'pending' as const, progress: 0,
    }));
    setFiles((prev) => [...prev, ...arr]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }, []);

  const uploadFile = async (f: UploadFile) => {
    const update = (patch: Partial<UploadFile>) =>
      setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, ...patch } : x));
    try {
      update({ status: 'uploading', progress: 0 });
      const { data: init } = await uploadApi.init(f.file.name, f.file.size, f.file.type || 'application/octet-stream');
      const chunks = splitIntoChunks(f.file);
      for (let i = 0; i < chunks.length; i++) {
        await uploadApi.chunk(init.sessionId, i, chunks[i]);
        update({ progress: Math.round(((i + 1) / init.totalChunks) * 92) });
      }
      await uploadApi.complete(init.sessionId);
      update({ status: 'done', progress: 100 });
      addNotification({ type: 'upload', message: f.file.name + ' uploaded successfully' });
    } catch (err: any) {
      update({ status: 'error', error: err.response?.data?.error || 'Upload failed' });
      addNotification({ type: 'error', message: 'Failed to upload ' + f.file.name });
    }
  };

  const uploadAll  = () => files.filter((f) => f.status === 'pending').forEach(uploadFile);
  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const pending    = files.filter((f) => f.status === 'pending').length;
  const allDone    = files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'error');

  return (
    <div style={{ padding: 32, background: t.bg, minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button onClick={() => router.push('/dashboard')}
            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid ' + t.border, background: t.bgSecondary, color: t.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, letterSpacing: '-0.4px', marginBottom: 2 }}>Upload files</h1>
            <p style={{ fontSize: 13, color: t.textSecondary }}>Files split into 4MB chunks and uploaded reliably</p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '52px 32px', borderRadius: 16, border: '2px dashed ' + (dragOver ? '#2383e2' : t.border), background: dragOver ? 'rgba(35,131,226,0.04)' : t.bgSecondary, cursor: 'pointer', marginBottom: 20, transition: 'all 0.15s' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(35,131,226,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <CloudUpload size={26} color="#2383e2" />
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: t.text, marginBottom: 6 }}>Drop files here or click to browse</p>
          <p style={{ fontSize: 13, color: t.textMuted }}>Any file type · Chunked upload · Auto-resume</p>
          <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
            onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {files.map((f) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: t.bgSecondary, border: '1px solid ' + t.border }}>
                {/* Icon */}
                <div style={{ width: 36, height: 36, borderRadius: 8, background: t.bgHover, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {getFileIcon(f.file.type)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</p>
                    <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 8, flexShrink: 0 }}>{formatBytes(f.file.size)}</span>
                  </div>

                  {f.status === 'uploading' && (
                    <div>
                      <div style={{ height: 4, borderRadius: 2, background: t.border, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: f.progress + '%', background: 'linear-gradient(90deg, #2383e2, #9065b0)', transition: 'width 0.3s' }} />
                      </div>
                      <p style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>{f.progress}% uploaded</p>
                    </div>
                  )}
                  {f.status === 'done'     && <p style={{ fontSize: 11, color: '#0f7b6c' }}>✓ Uploaded successfully</p>}
                  {f.status === 'error'    && <p style={{ fontSize: 11, color: '#b91c1c' }}>{f.error}</p>}
                  {f.status === 'pending'  && <p style={{ fontSize: 11, color: t.textMuted }}>Ready to upload</p>}
                </div>

                {/* Status icon */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  {f.status === 'done'     && <CheckCircle size={16} color="#0f7b6c" />}
                  {f.status === 'error'    && <AlertCircle size={16} color="#b91c1c" />}
                  {f.status === 'uploading'&& <Loader2 size={16} color="#2383e2" style={{ animation: 'spin 1s linear infinite' }} />}
                  {f.status === 'pending'  && (
                    <button onClick={() => removeFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, padding: 0, display: 'flex' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {files.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {pending > 0 && (
              <button onClick={uploadAll}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: '#2383e2', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora', sans-serif" }}>
                <Upload size={14} /> Upload {pending} file{pending > 1 ? 's' : ''}
              </button>
            )}
            {allDone && (
              <button onClick={() => router.push('/dashboard')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: '#0f7b6c', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora', sans-serif" }}>
                <CheckCircle size={14} /> Go to dashboard
              </button>
            )}
            <button onClick={() => setFiles([])}
              style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid ' + t.border, background: 'transparent', color: t.textSecondary, fontSize: 13, cursor: 'pointer', fontFamily: "'Sora', sans-serif" }}>
              Clear all
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}