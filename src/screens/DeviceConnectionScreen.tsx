import { useTranslation } from 'react-i18next';
import { AppTopBar } from '../components/AppTopBar';
import { useBluetoothScale } from '../hooks/useBluetoothScale';

export function DeviceConnectionScreen() {
  const { t } = useTranslation();
  const scale = useBluetoothScale();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 space-y-3 p-4">
        <h1 className="mb-2 text-lg font-bold text-gray-800">{t('deviceConnections')}</h1>

        {/* BLE Scale — real implementation */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">{t('bleScaleTitle')}</h3>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    scale.isConnected
                      ? 'bg-green-500'
                      : scale.isConnecting
                        ? 'animate-pulse bg-yellow-400'
                        : 'bg-gray-300'
                  }`}
                />
                <span className={`text-sm ${scale.isConnected ? 'text-green-600' : 'text-gray-500'}`}>
                  {scale.isConnecting
                    ? 'Connecting...'
                    : scale.isConnected
                      ? 'Connected'
                      : 'Disconnected'}
                </span>
              </div>
              {scale.isConnected && scale.weight !== null && (
                <p className="mt-1 text-lg font-bold text-blue-600">{scale.weight}g</p>
              )}
              {scale.error && (
                <p className="mt-1 text-xs text-red-500">{scale.error}</p>
              )}
              {!scale.isSupported && (
                <p className="mt-1 text-xs text-gray-400">Bluetooth not supported in this browser</p>
              )}
            </div>
            <button
              type="button"
              onClick={scale.isConnected ? scale.disconnect : scale.connect}
              disabled={!scale.isSupported || scale.isConnecting}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                scale.isConnected
                  ? 'border border-red-300 text-red-600 hover:bg-red-50'
                  : 'border border-blue-300 text-blue-600 hover:bg-blue-50'
              }`}
            >
              {scale.isConnected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* RFID Scanner — placeholder */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800">{t('rfidScannerTitle')}</h3>
          <p className="text-sm text-gray-400">{t('rfidScannerStatus')}</p>
          <p className="mt-1 text-xs text-gray-400">{t('rfidScannerComing')}</p>
        </div>

        {/* QR Scanner — active */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
            <h3 className="font-semibold text-gray-800">{t('qrScannerTitle')}</h3>
          </div>
          <p className="text-sm text-green-600">{t('qrScannerStatus')}</p>
        </div>
      </div>
    </div>
  );
}
