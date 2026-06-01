import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ScaleIcon,
  ExclamationTriangleIcon,
  DevicePhoneMobileIcon,
  ArrowPathIcon,
  ChartBarIcon,
  BellAlertIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import { AppTopBar } from '../components/AppTopBar';
import { ActionCard } from '../components/ActionCard';
import { AlertsBadge } from '../components/AlertsBadge';
import { useOperator } from '../hooks/useOperator';
import { useUnreadAlertCount } from '../hooks/useAlerts';

export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { name } = useOperator();
  const alertCount = useUnreadAlertCount();

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mb-4 rounded-xl bg-blue-500 p-4 text-white shadow">
          <p className="text-sm opacity-80">{t('welcome')}</p>
          <p className="text-lg font-bold">{name}</p>
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('quickActions')}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <ActionCard
            icon={<ScaleIcon className="h-8 w-8" />}
            title={t('actionWeight')}
            subtitle={t('actionWeightSubtitle')}
            onClick={() => navigate('/measurement')}
          />
          <ActionCard
            icon={<ExclamationTriangleIcon className="h-8 w-8" />}
            title={t('actionMortality')}
            subtitle={t('actionMortalitySubtitle')}
            onClick={() => navigate('/mortality')}
          />
          <ActionCard
            icon={<ChartBarIcon className="h-8 w-8" />}
            title={t('actionDashboard')}
            subtitle={t('actionDashboardSubtitle')}
            onClick={() => navigate('/dashboard')}
          />
          <ActionCard
            icon={<BanknotesIcon className="h-8 w-8" />}
            title={t('actionProduction')}
            subtitle={t('actionProductionSubtitle')}
            onClick={() => navigate('/production')}
          />
          <ActionCard
            icon={<ArrowTrendingUpIcon className="h-8 w-8" />}
            title={t('actionForecast')}
            subtitle={t('actionForecastSubtitle')}
            onClick={() => navigate('/forecast')}
          />
          <ActionCard
            icon={
              <div className="relative">
                <BellAlertIcon className="h-8 w-8" />
                <AlertsBadge count={alertCount} />
              </div>
            }
            title={t('actionAlerts')}
            subtitle={t('actionAlertsSubtitle')}
            onClick={() => navigate('/alerts')}
          />
          <ActionCard
            icon={<DevicePhoneMobileIcon className="h-8 w-8" />}
            title={t('actionDevices')}
            subtitle={t('actionDevicesSubtitle')}
            onClick={() => navigate('/device-connection')}
          />
          <ActionCard
            icon={<ArrowPathIcon className="h-8 w-8" />}
            title={t('actionSync')}
            subtitle={t('actionSyncSubtitle')}
            onClick={() => navigate('/sync-status')}
          />
        </div>
      </div>
    </div>
  );
}
