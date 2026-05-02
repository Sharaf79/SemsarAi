import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type AppNotification,
  type NotificationType,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
} from '../api/notifications';

const POLL_INTERVAL_MS = 20_000;

const TYPE_ICON: Record<NotificationType, string> = {
  OFFER_PROPOSED: '💬',
  OFFER_ACCEPTED: '✅',
  OFFER_REJECTED: '❌',
  OFFER_COUNTERED: '↩️',
  NEGOTIATION_AGREED: '🎉',
  NEGOTIATION_FAILED: '⚠️',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'الآن';
  if (m < 60) return `من ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `من ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `من ${d} يوم`;
}

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const c = await getUnreadCount();
      setCount(c);
    } catch {
      /* unauthenticated or network — keep silent */
    }
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listNotifications({ limit: 20 });
      setItems(list);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const id = window.setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    refreshList();
  }, [open, refreshList]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const handleClickItem = async (n: AppNotification) => {
    try {
      if (!n.isRead) {
        await markRead(n.id);
        setCount((c) => Math.max(0, c - 1));
        setItems((arr) =>
          arr.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
        );
      }
    } catch {
      /* noop */
    }
    setOpen(false);
    if (n.link) {
      if (/^https?:\/\//.test(n.link)) {
        window.location.href = n.link;
      } else {
        navigate(n.link);
      }
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllRead();
      setCount(0);
      setItems((arr) => arr.map((x) => ({ ...x, isRead: true })));
    } catch {
      /* noop */
    }
  };

  return (
    <div className="notif-bell" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell__btn"
        aria-label="الإشعارات"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="notif-bell__icon">🔔</span>
        {count > 0 && (
          <span className="notif-bell__badge">{count > 99 ? '99+' : count}</span>
        )}
      </button>

      {open && (
        <div className="notif-bell__panel" role="dialog">
          <div className="notif-bell__header">
            <strong>الإشعارات</strong>
            {items.some((n) => !n.isRead) && (
              <button
                type="button"
                className="notif-bell__mark-all"
                onClick={handleMarkAll}
              >
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="notif-bell__list">
            {loading && (
              <div className="notif-bell__empty">جارٍ التحميل…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="notif-bell__empty">لا توجد إشعارات حتى الآن.</div>
            )}
            {!loading &&
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-bell__item ${
                    n.isRead ? '' : 'notif-bell__item--unread'
                  }`}
                  onClick={() => handleClickItem(n)}
                >
                  <span className="notif-bell__item-icon">
                    {TYPE_ICON[n.type] ?? '🔔'}
                  </span>
                  <span className="notif-bell__item-body">
                    <span className="notif-bell__item-title">{n.title}</span>
                    <span className="notif-bell__item-text">{n.body}</span>
                    <span className="notif-bell__item-time">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                  {!n.isRead && <span className="notif-bell__item-dot" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
