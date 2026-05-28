import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ScaleIcon,
  ExclamationTriangleIcon,
  DevicePhoneMobileIcon,
  ArrowPathIcon,
  ChartBarIcon,
  BellAlertIcon,
} from '@heroicons/react/24/outline';
import { AppTopBar } from '../components/AppTopBar';
import { ActionCard } from '../components/ActionCard';
import { AlertsBadge } from '../components/AlertsBadge';
import { KpiStrip } from '../components/KpiStrip';
import { ProductionForecastCard } from '../components/ProductionForecastCard';
import { useOperator } from '../hooks/useOperator';
import { useUnreadAlertCount } from '../hooks/useAlerts';
import { useFarms } from '../hooks/useFarms';
import { useDashboardData } from '../hooks/useDashboardData';

export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { name } = useOperator();
  const alertCount = useUnreadAlertCount();
  const farms = useFarms();
  const defaultFarmSlug = farms.length > 0 ? farms[0].slug : undefined;
  const { summaryStats, isLoading, dataSource } = useDashboardData({
    farmSlug: defaultFarmSlug,
    dateRange: 'last12w',
  });

  const hasData = !isLoading && dataSource !== 'empty';

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mb-4 rounded-xl bg-blue-500 p-4 text-white shadow">
          <p className="text-sm opacity-80">{t('welcome')}</p>
          <p className="text-lg font-bold">{name}</p>
        </div>

        {hasData && (
          <div className="mb-4 space-y-3">
            <KpiStrip
              totalAnimals={summaryStats.totalAnimals}
              averageWeight={summaryStats.averageWeight}
            />
            <ProductionForecastCard
              totalAnimals={summaryStats.totalAnimals}
              averageWeight={summaryStats.averageWeight}
            />
          </div>
        )}

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
