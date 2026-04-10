import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './store/AuthContext';
import { ChatProvider } from './store/ChatContext';
import { HomePage } from './pages/HomePage';
import { NegotiationPage } from './pages/NegotiationPage';
import { MockPaymentPage } from './pages/MockPaymentPage';
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
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/negotiation/:id" element={<NegotiationPage />} />
              <Route path="/payment/:paymentId" element={<MockPaymentPage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
            {/* Floating AI chat — persists across all pages */}
            <ChatWidget />
          </BrowserRouter>
        </ChatProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
