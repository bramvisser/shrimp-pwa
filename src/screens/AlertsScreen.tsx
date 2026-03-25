import { useState } from 'react';
import {
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { AppTopBar } from '../components/AppTopBar';
import { mockAlerts, type Alert } from '../data/mockAlerts';

const severityOrder: Record<Alert['type'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const typeStyles: Record<
  Alert['type'],
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

function AlertIcon({ type }: { type: Alert['type'] }) {
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
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const sortedAlerts = [...mockAlerts].sort(
    (a, b) => severityOrder[a.type] - severityOrder[b.type],
  );

  const criticalCount = mockAlerts.filter((a) => a.type === 'critical').length;
  const warningCount = mockAlerts.filter((a) => a.type === 'warning').length;
  const infoCount = mockAlerts.filter((a) => a.type === 'info').length;

  function handleAcknowledge(id: string) {
    setAcknowledged((prev) => new Set(prev).add(id));
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 p-4">
        {/* Summary badges */}
        <div className="mb-4 flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
              {warningCount} warnings
            </span>
          )}
          {infoCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              {infoCount} info
            </span>
          )}
        </div>

        {/* Alert cards */}
        <div className="space-y-3">
          {sortedAlerts.map((alert) => {
            const isAcknowledged =
              alert.acknowledged || acknowledged.has(alert.id);
            const styles = typeStyles[alert.type];

            return (
              <div
                key={alert.id}
                className={`overflow-hidden rounded-lg bg-white shadow transition-opacity ${
                  isAcknowledged ? 'opacity-40' : ''
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
                      {(alert.farm || alert.tank) && (
                        <p className="text-sm text-gray-500">
                          {[alert.farm, alert.tank]
                            .filter(Boolean)
                            .join(' \u2014 ')}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-gray-600">
                        {alert.message}
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {alert.timestamp}
                        </span>
                        {!isAcknowledged && (
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 active:bg-gray-200"
                          >
                            Acknowledge
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
