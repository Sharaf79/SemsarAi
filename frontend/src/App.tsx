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
import { AddListingPage } from './pages/AddListingPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HelpPage } from './pages/HelpPage';
import { AdminReviewPage } from './pages/AdminReviewPage';
import { SellerActionPage } from './pages/SellerActionPage';
import { AddPropertyWizardPage } from './pages/PropertyWizard/AddPropertyWizardPage';
import { SearchChatPage } from './pages/SearchChatPage';
import { SellerActionRedirect } from './pages/SellerActionRedirect';
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
              {/* Legacy seller-action deep-link → resolves token & redirects to unified negotiation page */}
              <Route path="/seller-action/:token" element={<SellerActionRedirect />} />
              <Route path="/payment/:paymentId" element={<MockPaymentPage />} />
              <Route path="/listing-payment/:creditId" element={<ListingPaymentPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/my-listings" element={<MyListingsPage />} />
              <Route path="/add-listing" element={<AddListingPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/admin/review" element={<AdminReviewPage />} />
              <Route path="/seller-action/:token" element={<SellerActionPage />} />
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
