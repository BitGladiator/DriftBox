'use client';

import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Upload, RefreshCw, Share2, AlertCircle, X } from 'lucide-react';

const CONFIG = {
  upload: { icon: Upload,       bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  sync:   { icon: RefreshCw,    bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
  share:  { icon: Share2,       bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe' },
  error:  { icon: AlertCircle,  bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
};

export default function NotificationToast() {
  const { notifications, removeNotification } = useStore();

  useEffect(() => {
    notifications.forEach((n) => {
      const t = setTimeout(() => removeNotification(n.id), 4000);
      return () => clearTimeout(t);
    });
  }, [notifications]);

  if (!notifications.length) return null;

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, fontFamily: "'Sora', sans-serif" }}>
      {notifications.slice(0, 3).map((n) => {
        const { icon: Icon, bg, color, border } = CONFIG[n.type];
        return (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: bg, border: '1px solid ' + border, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', animation: 'slideUp 0.2s ease' }}>
            <Icon size={14} color={color} style={{ flexShrink: 0 }} />
            <p style={{ fontSize: 13, fontWeight: 500, color, flex: 1, lineHeight: 1.4 }}>{n.message}</p>
            <button onClick={() => removeNotification(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color, opacity: 0.5, padding: 0, display: 'flex', flexShrink: 0 }}>
              <X size={12} />
            </button>
          </div>
        );
      })}
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}