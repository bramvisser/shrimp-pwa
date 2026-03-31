import { createBrowserRouter, Navigate } from 'react-router-dom';
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MeasurementScreen } from '../screens/MeasurementScreen';
import { MortalityScreen } from '../screens/MortalityScreen';
import { SyncStatusScreen } from '../screens/SyncStatusScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DeviceConnectionScreen } from '../screens/DeviceConnectionScreen';
import { FarmDashboardScreen } from '../screens/FarmDashboardScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { ShareScreen } from '../screens/ShareScreen';
import { CompareScreen } from '../screens/CompareScreen';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const name = localStorage.getItem('operator_name');
  if (!name) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const name = localStorage.getItem('operator_name');
  if (name) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/', element: <SplashScreen /> },
  {
    path: '/login',
    element: (
      <GuestGuard>
        <LoginScreen />
      </GuestGuard>
    ),
  },
  {
    path: '/home',
    element: (
      <AuthGuard>
        <HomeScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/measurement',
    element: (
      <AuthGuard>
        <MeasurementScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/mortality',
    element: (
      <AuthGuard>
        <MortalityScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/sync-status',
    element: (
      <AuthGuard>
        <SyncStatusScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/settings',
    element: (
      <AuthGuard>
        <SettingsScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/device-connection',
    element: (
      <AuthGuard>
        <DeviceConnectionScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <AuthGuard>
        <FarmDashboardScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/alerts',
    element: (
      <AuthGuard>
        <AlertsScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/compare',
    element: (
      <AuthGuard>
        <CompareScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/share',
    element: (
      <AuthGuard>
        <ShareScreen />
      </AuthGuard>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
