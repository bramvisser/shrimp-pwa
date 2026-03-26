import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useBluetoothScale } from '../hooks/useBluetoothScale';

/**
 * Compact inline indicator for a BLE weight scale.
 *
 * Place this next to (or above) the Weight field on the MeasurementScreen.
 * It shows live connection status and the current weight reading, and lets
 * the operator connect / disconnect with a single tap.
 *
 * Props:
 *  - `onWeightChange` — called whenever a new weight (grams) arrives so the
 *     parent can push it into the weight input field.
 */
interface BluetoothScaleIndicatorProps {
  /** Called with the latest weight in grams whenever it changes. */
  onWeightChange?: (grams: number) => void;
}

export function BluetoothScaleIndicator({ onWeightChange }: BluetoothScaleIndicatorProps) {
  const {
    connect,
    disconnect,
    isConnected,
    isConnecting,
    isSupported,
    weight,
    error,
  } = useBluetoothScale();
  const { t } = useTranslation();

  // Forward weight to parent whenever it changes
  const onWeightChangeRef = useRef(onWeightChange);
  onWeightChangeRef.current = onWeightChange;

  useEffect(() => {
    if (weight !== null) {
      onWeightChangeRef.current?.(weight);
    }
  }, [weight]);

  if (!isSupported) return null;

  // ── Status dot colour ──────────────────────────────────────────
  const dotClass = clsx(
    'inline-block h-2.5 w-2.5 rounded-full',
    isConnected && 'bg-green-500',
    isConnecting && 'bg-yellow-400 animate-pulse',
    !isConnected && !isConnecting && 'bg-gray-400',
  );

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm">
      {/* Status dot */}
      <span className={dotClass} />

      {/* Label / weight */}
      {isConnecting && (
        <span className="text-yellow-600">{t('connecting')}</span>
      )}

      {isConnected && weight !== null && (
        <span className="font-medium text-gray-800">{weight} g</span>
      )}

      {isConnected && weight === null && (
        <span className="text-gray-500">{t('waitingForReading')}</span>
      )}

      {!isConnected && !isConnecting && (
        <span className="text-gray-500">{t('scaleDisconnected')}</span>
      )}

      {/* Connect / disconnect button */}
      {isConnected ? (
        <button
          type="button"
          onClick={disconnect}
          className="ml-auto rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
        >
          {t('disconnect')}
        </button>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={isConnecting}
          className="ml-auto rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
        >
          {isConnecting ? '...' : t('connectScale')}
        </button>
      )}

      {/* Error (below, full-width) */}
      {error && (
        <p className="basis-full text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
