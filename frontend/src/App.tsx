import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './store/AuthContext';
import { ChatProvider } from './store/ChatContext';
import { FavoritesProvider } from './store/FavoritesContext';
import { HomePage } from './pages/HomePage';
import { NegotiationPage } from './pages/NegotiationPage';
import { MockPaymentPage } from './pages/MockPaymentPage';
import { ListingPaymentPage } from './pages/ListingPaymentPage';
import { PropertyPage } from './pages/PropertyPage';
import { ProfilePage } from './pages/ProfilePage';
import { MyListingsPage } from './pages/MyListingsPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HelpPage } from './pages/HelpPage';
import { AdminReviewPage } from './pages/AdminReviewPage';
import AddPropertyWizardPage from './pages/PropertyWizard/AddPropertyWizard';
import { ChatWidget } from './components/ChatWidget';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ChatProvider>
          <FavoritesProvider>
            <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/property/:id" element={<PropertyPage />} />
              <Route path="/negotiation/:id" element={<NegotiationPage />} />
              <Route path="/payment/:paymentId" element={<MockPaymentPage />} />
              <Route path="/listing-payment/:creditId" element={<ListingPaymentPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/my-listings" element={<MyListingsPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/admin/review" element={<AdminReviewPage />} />
              <Route path="/add-property" element={<AddPropertyWizardPage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
            {/* Floating AI chat — persists across all pages */}
            <ChatWidget />
          </BrowserRouter>
          </FavoritesProvider>
        </ChatProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
