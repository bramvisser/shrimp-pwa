import { useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface BarcodeScannerModalProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({ onScan, onClose }: BarcodeScannerModalProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  const stopScanner = useCallback(async () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    try {
      await scannerRef.current?.stop();
    } catch {
      // already stopped
    }
  }, []);

  useEffect(() => {
    const scanner = new Html5Qrcode('barcode-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await stopScanner();
          onScanRef.current(decodedText);
          onCloseRef.current();
        },
        undefined
      )
      .catch(console.error);

    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative w-full max-w-sm rounded-lg bg-white p-4">
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full p-1 text-gray-500 hover:bg-gray-100"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
        <div id="barcode-reader" className="mt-6 w-full" />
      </div>
    </div>
  );
}
