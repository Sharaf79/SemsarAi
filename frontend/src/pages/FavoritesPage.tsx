import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext';
import { useFavorites } from '../store/FavoritesContext';
import { useChatContext } from '../store/ChatContext';
import { fetchFavorites } from '../api/favorites';
import { Header } from '../components/Header';
import { PropertyCard } from '../components/PropertyCard';
import type { Property } from '../types';

export const FavoritesPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const { openChat } = useChatContext();
  const navigate = useNavigate();


  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['favorites'],
    queryFn: fetchFavorites,
    enabled: isAuthenticated,
  });

  const properties = data?.data ?? [];

  const handleContact = (property: Property) => {
    navigate(`/property/${property.id}`);
  };

  const handleChat = (property: Property) => {
    openChat(`أبحث عن تفاصيل العقار ${property.title}`);
  };

  return (
    <>
      <Header onLoginClick={() => {}} />
      <div className="favorites-page">
        <h1 className="favorites-page__title">❤️ المفضّلة</h1>

        {isLoading && (
          <div className="loading-center">
            <div className="spinner spinner-lg" />
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            حدث خطأ أثناء تحميل المفضّلة
          </div>
        )}

        {!isLoading && properties.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">💔</div>
            <div className="empty-state__title">لا توجد إعلانات مفضّلة</div>
            <div className="empty-state__sub">
              اضغط على ❤️ في أي إعلان لإضافته هنا
            </div>
            <Link
              to="/"
              className="btn btn-primary btn-lg"
              style={{ marginTop: '16px', display: 'inline-flex' }}
            >
              🏠 تصفّح العقارات
            </Link>
          </div>
        )}

        <div className="property-grid">
          {properties.map((property: Property) => (
            <PropertyCard
              key={property.id}
              property={property}
              onContact={handleContact}
              onChat={handleChat}
              isFavorited={isFavorite(property.id)}
              onToggleFavorite={toggle}
            />
          ))}
        </div>
      </div>
    </>
  );
};
