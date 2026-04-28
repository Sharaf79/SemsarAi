import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useChatContext } from '../store/ChatContext';
import { UserMenu } from './UserMenu';
import CreateRequestModal from './CreateRequestModal';

interface HeaderProps {
  onLoginClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLoginClick }) => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { openChat } = useChatContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  return (
    <header className="header">
      <Link to="/" className="header__logo">
        <div className="header__logo-icon">🏠</div>
        <span>سمسار AI</span>
      </Link>

      <div className="header__spacer" />

      <div className="header__user">
          {/* زر محذوف تم حذفه بناءً على طلب المستخدم */}

        {/* زر اضافة عقار تم حذفه بناءً على طلب المستخدم */}

        <Link
          to="/properties/add"
          className="btn btn-primary btn-sm"
          style={{ marginLeft: '12px', background: '#2563eb' }}
        >
          المالك
        </Link>

        {isAuthenticated && (
          <Link
            to="/my-requests"
            className="btn btn-primary btn-sm"
            style={{ marginLeft: '8px', background: '#4F46E5' }}
          >
            المشتري/المستأجر
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

      <CreateRequestModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        onCreated={() => {
          setShowRequestModal(false);
          navigate('/my-requests');
        }}
      />
    </header>
  );
};
