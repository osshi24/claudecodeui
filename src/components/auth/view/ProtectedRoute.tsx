import { useState } from 'react';
import type { ReactNode } from 'react';
import { IS_PLATFORM } from '../../../constants/config';
import { useAuth } from '../context/AuthContext';
import Onboarding from '../../onboarding/view/Onboarding';
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
    hasCompletedOnboarding,
    refreshOnboardingStatus,
  } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (IS_PLATFORM) {
    if (!hasCompletedOnboarding) {
      return <Onboarding onComplete={refreshOnboardingStatus} />;
    }

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

  if (!hasCompletedOnboarding) {
    return <Onboarding onComplete={refreshOnboardingStatus} />;
  }

  return <>{children}</>;
}
