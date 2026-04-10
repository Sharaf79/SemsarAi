import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useChatContext } from '../store/ChatContext';

interface HeaderProps {
  onLoginClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLoginClick }) => {
  const { isAuthenticated, user, logout } = useAuth();
  const { openChat } = useChatContext();

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

        {isAuthenticated && user ? (
          <>
            <div className="header__avatar" title={user.name ?? 'مستخدم'}>
              {user.name ? user.name[0].toUpperCase() : '👤'}
            </div>
            <span style={{ fontWeight: 600, margin: '0 8px' }}>
              أهلاً بك {user.name ? `، ${user.name}` : ''}
            </span>
            <button
              className="btn btn-muted btn-sm"
              onClick={logout}
            >
              خروج
            </button>
          </>
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
