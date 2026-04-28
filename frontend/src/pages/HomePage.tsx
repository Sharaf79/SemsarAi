import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { FiltersSidebar } from '../components/FiltersSidebar';
import { PropertyGrid } from '../components/PropertyGrid';
import { AuthModal } from '../components/AuthModal';
import CreateRequestModal from '../components/CreateRequestModal';
import { useAuth } from '../store/AuthContext';
import { useChatContext } from '../store/ChatContext';
import type { Property, PropertyFilters } from '../types/index';

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { openChat } = useChatContext();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<PropertyFilters>({ sort: 'newest' });
  const [searchParams] = useSearchParams();
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Sync URL query params (set by chat search) into the filter state in real-time
  useEffect(() => {
    const type = searchParams.get('type') as PropertyFilters['propertyType'] | null;
    const kind = searchParams.get('kind') as PropertyFilters['propertyKind'] | null;
    const gov = searchParams.get('gov');
    const city = searchParams.get('city');
    const beds = searchParams.get('beds');
    const maxPrice = searchParams.get('maxPrice');
    const hasParams = type || kind || gov || city || beds || maxPrice;
    if (hasParams) {
      setFilters({
        sort: 'newest',
        ...(type ? { propertyType: type } : {}),
        ...(kind ? { propertyKind: kind } : {}),
        ...(gov ? { governorate: gov } : {}),
        ...(city ? { city } : {}),
        ...(beds ? { bedrooms: Number(beds) } : {}),
        ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}),
      });
    }
  }, [searchParams]);
  const [pendingProperty, setPendingProperty] = useState<Property | null>(null);

  // Called when user clicks "تواصل" on any card
  const handleContact = (property: Property) => {
    if (!isAuthenticated) {
      setPendingProperty(property);
      setAuthModalOpen(true);
    } else {
      navigate(`/negotiation/${property.id}`, { state: { property } });
    }
  };

  // Called when user clicks "تحدث مع AI" on any card
  const handleChat = (property: Property) => {
    openChat(
      `أريد الاستفسار عن العقار: ${property.title} — السعر ${parseFloat(property.price).toLocaleString('ar-EG')} ج.م`,
    );
  };

  // After auth success — if there was a pending property, navigate to negotiation
  const handleAuthSuccess = () => {
    setAuthModalOpen(false);
    if (pendingProperty) {
      const p = pendingProperty;
      setPendingProperty(null);
      navigate(`/negotiation/${p.id}`, { state: { property: p } });
    }
  };


  return (
    <>
      <Header onLoginClick={() => setAuthModalOpen(true)} />

      {/* Hero + Search */}
      <div className="hero">
        <h1 className="hero__title">ابحث عن عقارك المثالي 🏠</h1>
        <p className="hero__sub">آلاف العقارات في مصر — سمسار AI يتفاوض بدلاً عنك</p>

        {/* Role-selection buttons */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
            margin: '20px 0 24px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                setAuthModalOpen(true);
                return;
              }
              navigate('/my-listings');
            }}
            style={{
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '14px 32px',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            }}
          >
            🏠 المالك
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                setAuthModalOpen(true);
                return;
              }
              setShowRequestModal(true);
            }}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '14px 32px',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
            }}
          >
            🔍 المشتري / المستأجر
          </button>
        </div>

        <div className="search-bar">
          <input
            className="search-bar__input"
            placeholder="ابحث بالمدينة أو الحي…"
            value={filters.city ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value || undefined }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setFilters((f) => ({ ...f }));
            }}
          />
          <select
            className="search-bar__select"
            value={filters.propertyType ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                propertyType: (e.target.value as PropertyFilters['propertyType']) || undefined,
              }))
            }
          >
            <option value="">الكل</option>
            <option value="SALE">للبيع</option>
            <option value="RENT">للإيجار</option>
          </select>
          <button
            className="search-bar__btn"
            onClick={() => setFilters((f) => ({ ...f }))}
          >
            🔍 بحث
          </button>
        </div>
      </div>

      {/* Main layout: sidebar + grid */}
      <div className="main-layout">
        <FiltersSidebar filters={filters} onChange={setFilters} />
        <PropertyGrid filters={filters} onContact={handleContact} onChat={handleChat} />
      </div>

      {/* Main layout: sidebar + grid */}
      <div className="main-layout">
        <FiltersSidebar filters={filters} onChange={setFilters} />
        <PropertyGrid filters={filters} onContact={handleContact} onChat={handleChat} />
      </div>

      {/* Auth modal */}
      {isAuthModalOpen && (
        <AuthModal
          onClose={() => {
            setAuthModalOpen(false);
            if (!pendingProperty) setPendingProperty(null);
          }}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* Create request modal */}
      {showRequestModal && (
        <CreateRequestModal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          onCreated={() => setShowRequestModal(false)}
        />
      )}
    </>
  );
};
