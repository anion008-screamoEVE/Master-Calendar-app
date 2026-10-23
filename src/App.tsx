import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage, CompleteProfilePage } from './pages/AuthPage';
import { CalendarPage } from './pages/CalendarPage';
import { CalendarsPage } from './pages/CalendarsPage';
import { SharePage } from './pages/SharePage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { SettingsPage } from './pages/SettingsPage';
import { BottomNav } from './components/BottomNav';
import { Spinner } from './components/ui';

function Protected({ children }: { children: ReactNode }) {
  const { firebaseUser, profile, loading } = useAuth();
  if (loading)
    return (
      <div className="center-page">
        <Spinner />
      </div>
    );
  if (!firebaseUser) return <Navigate to="/auth" replace />;
  if (!profile) return <Navigate to="/complete-profile" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main className="app-main">{children}</main>
      <BottomNav />
    </div>
  );
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { firebaseUser, profile, loading } = useAuth();
  if (loading)
    return (
      <div className="center-page">
        <Spinner />
      </div>
    );
  if (firebaseUser && profile) return <Navigate to="/" replace />;
  if (firebaseUser && !profile) return <Navigate to="/complete-profile" replace />;
  return <>{children}</>;
}

function CompleteProfileGate({ children }: { children: ReactNode }) {
  const { firebaseUser, profile, loading } = useAuth();
  if (loading)
    return (
      <div className="center-page">
        <Spinner />
      </div>
    );
  if (!firebaseUser) return <Navigate to="/auth" replace />;
  if (profile) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/auth"
            element={
              <PublicOnly>
                <AuthPage />
              </PublicOnly>
            }
          />
          <Route
            path="/complete-profile"
            element={
              <CompleteProfileGate>
                <CompleteProfilePage />
              </CompleteProfileGate>
            }
          />
          <Route
            path="/"
            element={
              <Protected>
                <AppLayout>
                  <CalendarPage />
                </AppLayout>
              </Protected>
            }
          />
          <Route
            path="/calendars"
            element={
              <Protected>
                <AppLayout>
                  <CalendarsPage />
                </AppLayout>
              </Protected>
            }
          />
          <Route
            path="/share"
            element={
              <Protected>
                <AppLayout>
                  <SharePage />
                </AppLayout>
              </Protected>
            }
          />
          <Route
            path="/subscription"
            element={
              <Protected>
                <AppLayout>
                  <SubscriptionPage />
                </AppLayout>
              </Protected>
            }
          />
          <Route
            path="/settings"
            element={
              <Protected>
                <AppLayout>
                  <SettingsPage />
                </AppLayout>
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
