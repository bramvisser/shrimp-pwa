/**
 * useBluetoothScale — Web Bluetooth hook for BLE weight scales.
 *
 * Connects to a generic BLE weight scale (service 0x181D, characteristic
 * 0x2A9D) and streams live weight readings back to the caller.
 *
 * NOTE: The Web Bluetooth API requires a **secure context** — the page must
 * be served over HTTPS or from localhost.  On HTTP the `navigator.bluetooth`
 * object will be `undefined` and `isSupported` will be `false`.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ── BLE identifiers ────────────────────────────────────────────────
// Standard "Weight Scale" service & "Weight Measurement" characteristic
const WEIGHT_SCALE_SERVICE = 0x181d;
const WEIGHT_MEASUREMENT_CHAR = 0x2a9d;

// ── Public return type ─────────────────────────────────────────────
export interface UseBluetoothScaleReturn {
  /** Prompt the user to pair with a BLE scale and start listening. */
  connect: () => Promise<void>;
  /** Disconnect the current scale and clean up. */
  disconnect: () => void;
  /** `true` while a GATT connection is active. */
  isConnected: boolean;
  /** `true` while a connection attempt is in progress. */
  isConnecting: boolean;
  /** `true` when the browser supports Web Bluetooth. */
  isSupported: boolean;
  /** Latest weight reading in **grams**, or `null` if nothing received yet. */
  weight: number | null;
  /** Human-readable error string, or `null`. */
  error: string | null;
}

// ── Helper: parse weight from a BLE Weight Measurement value ───────
/**
 * The BLE Weight Measurement characteristic (0x2A9D) is defined as:
 *
 *   Byte 0        — Flags
 *     bit 0 = 0 → SI (kg) | bit 0 = 1 → Imperial (lb)
 *   Bytes 1–2     — Weight as uint16 LE
 *
 * Resolution depends on the unit flag:
 *   SI:       value × 0.005 kg  (i.e. value / 200 kg)
 *   Imperial: value × 0.01  lb
 *
 * We always return grams regardless of the unit the scale reports.
 */
function parseWeightMeasurement(data: DataView): number | null {
  if (data.byteLength < 3) return null;

  const flags = data.getUint8(0);
  const raw = data.getUint16(1, /* littleEndian */ true);
  const isImperial = (flags & 0x01) !== 0;

  if (isImperial) {
    // raw × 0.01 lb → grams  (1 lb = 453.592 g)
    return raw * 0.01 * 453.592;
  }

  // SI: raw × 0.005 kg → grams
  return raw * 0.005 * 1000;
}

/**
 * Fallback parser for non-standard scales that simply push a float or an
 * integer weight value in a single characteristic notification.  We try a
 * couple of common encodings.
 */
function parseFallbackWeight(data: DataView): number | null {
  // Try float32 LE (some cheap scales use this)
  if (data.byteLength >= 4) {
    const f = data.getFloat32(0, true);
    // Sanity-check: a shrimp weight is typically 0.1 – 500 g
    if (Number.isFinite(f) && f > 0 && f < 100_000) {
      return f;
    }
  }

  // Try uint16 LE interpreted as grams directly
  if (data.byteLength >= 2) {
    const u = data.getUint16(0, true);
    if (u > 0 && u < 100_000) {
      return u;
    }
  }

  // Single byte
  if (data.byteLength === 1) {
    const b = data.getUint8(0);
    if (b > 0) return b;
  }

  return null;
}

// ── Hook ───────────────────────────────────────────────────────────
export function useBluetoothScale(): UseBluetoothScaleReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs survive re-renders without causing them
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const isSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  // ── notification handler ──────────────────────────────────────
  const handleNotification = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;

    // First try standard BLE Weight Measurement format
    let parsed = parseWeightMeasurement(value);

    // Fall back to generic parsing
    if (parsed === null) {
      parsed = parseFallbackWeight(value);
    }

    if (parsed !== null) {
      // Round to 1 decimal place
      setWeight(Math.round(parsed * 10) / 10);
    }
  }, []);

  // ── disconnect handler (device-initiated) ─────────────────────
  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setWeight(null);
    characteristicRef.current = null;
    // We keep deviceRef so the user can see the device was lost
  }, []);

  // ── connect ───────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!isSupported) {
      setError('Bluetooth is not supported in this browser. Use Chrome on HTTPS or localhost.');
      return;
    }

    setError(null);
    setIsConnecting(true);

    try {
      let device: BluetoothDevice;

      try {
        // Attempt 1: filter by the standard Weight Scale service
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [WEIGHT_SCALE_SERVICE] }],
        });
      } catch {
        // Attempt 2: accept *any* device (user will pick manually)
        // Some scales don't advertise the standard service UUID.
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [WEIGHT_SCALE_SERVICE],
        });
      }

      deviceRef.current = device;
      device.addEventListener('gattserverdisconnected', handleDisconnect);

      // Connect GATT
      const server = await device.gatt!.connect();

      let characteristic: BluetoothRemoteGATTCharacteristic;

      try {
        const service = await server.getPrimaryService(WEIGHT_SCALE_SERVICE);
        characteristic = await service.getCharacteristic(WEIGHT_MEASUREMENT_CHAR);
      } catch {
        // Fallback: iterate all services and find a notifiable characteristic
        // This handles non-standard / proprietary scales.
        const services = await server.getPrimaryServices();
        let found: BluetoothRemoteGATTCharacteristic | null = null;

        for (const svc of services) {
          try {
            const chars = await svc.getCharacteristics();
            for (const c of chars) {
              if (c.properties.notify || c.properties.indicate) {
                found = c;
                break;
              }
            }
          } catch {
            // Some services may be inaccessible — skip them
          }
          if (found) break;
        }

        if (!found) {
          throw new Error(
            'No compatible weight characteristic found on this device. ' +
            'Make sure you selected a BLE weight scale.',
          );
        }
        characteristic = found;
      }

      // Subscribe to notifications
      characteristic.addEventListener('characteristicvaluechanged', handleNotification);
      await characteristic.startNotifications();

      characteristicRef.current = characteristic;
      setIsConnected(true);
    } catch (err: unknown) {
      // User cancelled the pairing dialog — not really an error
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        // User dismissed the chooser — silently ignore
        setError(null);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred while connecting to the scale.');
      }
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [isSupported, handleDisconnect, handleNotification]);

  // ── disconnect ────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    const characteristic = characteristicRef.current;
    if (characteristic) {
      try {
        characteristic.removeEventListener('characteristicvaluechanged', handleNotification);
        characteristic.stopNotifications().catch(() => { /* best effort */ });
      } catch {
        // Already disconnected — ignore
      }
      characteristicRef.current = null;
    }

    const device = deviceRef.current;
    if (device) {
      device.removeEventListener('gattserverdisconnected', handleDisconnect);
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
      deviceRef.current = null;
    }

    setIsConnected(false);
    setWeight(null);
    setError(null);
  }, [handleDisconnect, handleNotification]);

  // ── cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional cleanup of refs
      const characteristic = characteristicRef.current;
      const device = deviceRef.current;

      if (characteristic) {
        try {
          characteristic.stopNotifications().catch(() => {});
        } catch {
          // ignore
        }
      }

      if (device?.gatt?.connected) {
        device.gatt.disconnect();
      }
    };
  }, []);

  return { connect, disconnect, isConnected, isConnecting, isSupported, weight, error };
}
