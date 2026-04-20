import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useChatContext } from '../store/ChatContext';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  onLoginClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLoginClick }) => {
  const { isAuthenticated, user } = useAuth();
  const { openChat } = useChatContext();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="header">
      <Link to="/" className="header__logo">
        <div className="header__logo-icon">🏠</div>
        <span>سمسار AI</span>
      </Link>

      <div className="header__spacer" />

      <div className="header__user">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => openChat('أضيف عقار 🏠')}
          style={{ marginLeft: '12px', background: '#25D366' }}
        >
          اضافة عقار 🏠
        </button>

        <Link
          to="/properties/add"
          className="btn btn-primary btn-sm"
          style={{ marginLeft: '12px', background: '#2563eb' }}
        >
          📝 نموذج إضافة
        </Link>

        {isAuthenticated && (
          <Link
            to="/my-requests"
            className="btn btn-primary btn-sm"
            style={{ marginLeft: '8px', background: '#4F46E5' }}
          >
            🔍 طلباتي
          </Link>
        )}

        {isAuthenticated && user ? (
          <div className="header__menu-anchor">
            <button
              className="header__avatar"
              onClick={() => setMenuOpen((v) => !v)}
              title={user.name ?? 'مستخدم'}
            >
              {user.name ? user.name[0].toUpperCase() : '👤'}
            </button>
            <UserMenu
              isOpen={menuOpen}
              onClose={() => setMenuOpen(false)}
              onLoginClick={onLoginClick}
            />
          </div>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={onLoginClick}
          >
            🔑 تسجيل الدخول
          </button>
        )}
      </div>
    </header>
  );
};
