import React, { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useChatContext } from '../store/ChatContext';

interface UserMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginClick: () => void;
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-3);
}

export const UserMenu: React.FC<UserMenuProps> = ({ isOpen, onClose, onLoginClick }) => {
  const { isAuthenticated, user, logout } = useAuth();
  const { openChat } = useChatContext();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  if (!isAuthenticated || !user) {
    return (
      <div className="user-menu" ref={menuRef}>
        <div className="user-menu__section" style={{ textAlign: 'center', padding: '20px' }}>
          <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>
            سجّل دخولك للوصول إلى حسابك
          </p>
          <button
            className="btn btn-primary btn-full"
            onClick={() => {
              onClose();
              onLoginClick();
            }}
          >
            🔑 تسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="user-menu" ref={menuRef}>
      {/* Identity section */}
      <div className="user-menu__identity">
        <div className="user-menu__avatar">
          {user.name ? user.name[0].toUpperCase() : '👤'}
        </div>
        <div className="user-menu__identity-text">
          <span className="user-menu__name">{user.name || 'مستخدم'}</span>
          <span className="user-menu__phone">{maskPhone(user.phone)}</span>
        </div>
      </div>

      <div className="user-menu__divider" />

      {/* Profile */}
      <Link to="/profile" className="user-menu__item" onClick={onClose}>
        <span className="user-menu__item-icon">👤</span>
        <span>الملف الشخصي</span>
      </Link>

      <div className="user-menu__divider" />

      {/* Listings */}
      <Link to="/my-listings" className="user-menu__item" onClick={onClose}>
        <span className="user-menu__item-icon">📋</span>
        <span>إعلاناتي</span>
      </Link>
      <button
        className="user-menu__item"
        onClick={() => {
          onClose();
          openChat('أضيف عقار 🏠');
        }}
      >
        <span className="user-menu__item-icon">➕</span>
        <span>أضف إعلان جديد</span>
      </button>

      <div className="user-menu__divider" />

      {/* Favorites — coming soon */}
      <Link to="/favorites" className="user-menu__item" onClick={onClose}>
        <span className="user-menu__item-icon">❤️</span>
        <span>المفضّلة</span>
        <span className="user-menu__badge-soon">قريباً</span>
      </Link>

      <div className="user-menu__divider" />

      {/* Help */}
      <Link to="/help" className="user-menu__item" onClick={onClose}>
        <span className="user-menu__item-icon">❓</span>
        <span>المساعدة</span>
      </Link>

      <div className="user-menu__divider" />

      {/* Logout */}
      <button
        className="user-menu__item user-menu__item--danger"
        onClick={() => {
          onClose();
          logout();
          navigate('/');
        }}
      >
        <span className="user-menu__item-icon">🚪</span>
        <span>تسجيل الخروج</span>
      </button>
    </div>
  );
};
