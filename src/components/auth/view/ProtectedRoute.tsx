import { useState, type ReactNode } from 'react';

import { IS_PLATFORM } from '../../../constants/config';
import { useAuth } from '../context/AuthContext';

import AuthLoadingScreen from './AuthLoadingScreen';
import LoginForm from './LoginForm';
import SetupForm from './SetupForm';

type ProtectedRouteProps = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const {
    user,
    isLoading,
    needsSetup,
    allowRegistration,
  } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (IS_PLATFORM) {
    return <>{children}</>;
  }

  // No account yet: this is first-run setup, not an optional signup.
  if (needsSetup) {
    return <SetupForm />;
  }

  if (!user) {
    if (isRegistering) {
      return <SetupForm onBackToLogin={() => setIsRegistering(false)} />;
    }

    return (
      <LoginForm
        onCreateAccount={allowRegistration ? () => setIsRegistering(true) : undefined}
      />
    );
  }

  return <>{children}</>;
}
