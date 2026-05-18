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
import { BreedingHomeScreen } from '../screens/breeding/BreedingHomeScreen';
import { PedigreeScreen } from '../screens/breeding/PedigreeScreen';
import { GenotypingScreen } from '../screens/breeding/GenotypingScreen';
import { EvaluateScreen } from '../screens/breeding/EvaluateScreen';
import { GEBVScreen } from '../screens/breeding/GEBVScreen';
import { SelectionScreen } from '../screens/breeding/SelectionScreen';
import { GeneticProgressScreen } from '../screens/breeding/GeneticProgressScreen';
import { ProgramScreen } from '../screens/breeding/ProgramScreen';
import { KeepersortScreen } from '../screens/breeding/KeepersortScreen';

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
  {
    path: '/breeding',
    element: (
      <AuthGuard>
        <BreedingHomeScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/breeding/pedigree',
    element: (
      <AuthGuard>
        <PedigreeScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/breeding/genotyping',
    element: (
      <AuthGuard>
        <GenotypingScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/breeding/evaluate',
    element: (
      <AuthGuard>
        <EvaluateScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/breeding/gebv',
    element: (
      <AuthGuard>
        <GEBVScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/breeding/selection',
    element: (
      <AuthGuard>
        <SelectionScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/breeding/progress',
    element: (
      <AuthGuard>
        <GeneticProgressScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/breeding/program',
    element: (
      <AuthGuard>
        <ProgramScreen />
      </AuthGuard>
    ),
  },
  {
    path: '/breeding/keepersort',
    element: (
      <AuthGuard>
        <KeepersortScreen />
      </AuthGuard>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
