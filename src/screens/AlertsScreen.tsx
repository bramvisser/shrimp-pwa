import { useTranslation } from 'react-i18next';
import {
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import { AppTopBar } from '../components/AppTopBar';
import { useAlerts, markAlertRead } from '../hooks/useAlerts';
import type { AlertType } from '../db/database';

const severityOrder: Record<AlertType, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const typeStyles: Record<
  AlertType,
  { bar: string; icon: string; badge: string; badgeText: string }
> = {
  critical: {
    bar: 'bg-red-500',
    icon: 'text-red-500',
    badge: 'bg-red-100 text-red-700',
    badgeText: 'critical',
  },
  warning: {
    bar: 'bg-amber-400',
    icon: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    badgeText: 'warnings',
  },
  info: {
    bar: 'bg-blue-400',
    icon: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    badgeText: 'info',
  },
};

function AlertIcon({ type }: { type: AlertType }) {
  const className = `h-6 w-6 ${typeStyles[type].icon}`;

  switch (type) {
    case 'critical':
      return <ExclamationTriangleIcon className={className} />;
    case 'warning':
      return <ExclamationCircleIcon className={className} />;
    case 'info':
      return <InformationCircleIcon className={className} />;
  }
}

export function AlertsScreen() {
  const { t } = useTranslation();
  const alerts = useAlerts();

  const sortedAlerts = [...alerts].sort(
    (a, b) => severityOrder[a.type] - severityOrder[b.type],
  );

  const unread = alerts.filter((a) => a.readAt === null);
  const criticalCount = unread.filter((a) => a.type === 'critical').length;
  const warningCount = unread.filter((a) => a.type === 'warning').length;
  const infoCount = unread.filter((a) => a.type === 'info').length;

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {/* Summary badges */}
        <div className="mb-4 flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              {criticalCount} {t('critical')}
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
              {warningCount} {t('warnings')}
            </span>
          )}
          {infoCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              {infoCount} {t('info')}
            </span>
          )}
        </div>

        {/* Alert cards */}
        <div className="space-y-3">
          {sortedAlerts.map((alert) => {
            const isRead = alert.readAt !== null;
            const styles = typeStyles[alert.type];

            return (
              <div
                key={alert.id}
                className={`overflow-hidden rounded-lg bg-white shadow transition-opacity ${
                  isRead ? 'opacity-40' : ''
                }`}
              >
                <div className="flex">
                  {/* Color bar */}
                  <div className={`w-1.5 shrink-0 ${styles.bar}`} />

                  <div className="flex flex-1 gap-3 p-4">
                    {/* Icon */}
                    <div className="shrink-0 pt-0.5">
                      <AlertIcon type={alert.type} />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900">
                        {alert.title}
                      </p>
                      {(alert.farmName || alert.tankId) && (
                        <p className="text-sm text-gray-500">
                          {[alert.farmName, alert.tankId]
                            .filter(Boolean)
                            .join(' \u2014 ')}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-gray-600">
                        {alert.message}
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                        </span>
                        {isRead ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-400">
                            {t('archived')}
                          </span>
                        ) : (
                          <button
                            onClick={() => markAlertRead(alert.id)}
                            className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 active:bg-gray-200"
                          >
                            {t('markAsRead')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
