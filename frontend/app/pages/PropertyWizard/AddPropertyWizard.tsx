/**
 * AddPropertyWizard Page Component
 * Main entry point for the Add Property form wizard
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext'; // Adjust import path as needed
import WizardContainer from './components/WizardContainer';

/**
 * AddPropertyWizard Page
 * Displays the multi-step form wizard for adding a new property
 */
export const AddPropertyWizardPage: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      setRedirecting(true);
      // Redirect to login
      window.location.href = '/login';
    }
  }, [user, isLoading]);

  if (isLoading || !user || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <WizardContainer
        userId={user.id}
        onSuccess={(property) => {
          // Redirect to the newly created property page
          window.location.href = `/properties/${property.id}`;
        }}
        onError={(error) => {
          console.error('Wizard error:', error);
          // Error is displayed in the wizard component
        }}
      />
    </>
  );
};

export default AddPropertyWizardPage;
