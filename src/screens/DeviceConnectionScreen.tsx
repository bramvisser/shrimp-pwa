import { useTranslation } from 'react-i18next';
import { AppTopBar } from '../components/AppTopBar';

export function DeviceConnectionScreen() {
  const { t } = useTranslation();

  const devices = [
    {
      title: t('rfidScannerTitle'),
      status: t('rfidScannerStatus'),
      note: t('rfidScannerComing'),
      color: 'text-gray-400',
    },
    {
      title: t('bleScaleTitle'),
      status: t('bleScaleStatus'),
      note: t('bleScaleComing'),
      color: 'text-gray-400',
    },
    {
      title: t('qrScannerTitle'),
      status: t('qrScannerStatus'),
      note: t('qrScannerComing'),
      color: 'text-green-600',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 space-y-3 p-4">
        <h1 className="mb-2 text-lg font-bold text-gray-800">{t('deviceConnections')}</h1>

        {devices.map((device) => (
          <div key={device.title} className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-gray-800">{device.title}</h3>
            <p className={`text-sm ${device.color}`}>{device.status}</p>
            <p className="mt-1 text-xs text-gray-400">{device.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
