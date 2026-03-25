import { format } from 'date-fns';
import type { Measurement, Mortality } from '../db/database';

function escapeCSVField(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(isoString: string): string {
  try {
    return format(new Date(isoString), 'yyyy-MM-dd HH:mm');
  } catch {
    return isoString;
  }
}

function toCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCSVField).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSVField).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function exportMeasurementsCSV(measurements: Measurement[]): string {
  const headers = [
    'Date',
    'Farm',
    'Tank',
    'RFID Tag',
    'Barcode',
    'Animal ID',
    'Weight (g)',
    'Operator',
    'Sync Status',
  ];

  const rows = measurements.map((m) => [
    formatDate(m.createdAt),
    m.farmId,
    m.tankId ?? '',
    m.rfidTag ?? '',
    m.barcode ?? '',
    m.animalId ?? '',
    String(m.weightGrams),
    m.operatorName,
    m.syncStatus,
  ]);

  return toCSV(headers, rows);
}

export function exportMortalitiesCSV(mortalities: Mortality[]): string {
  const headers = [
    'Date',
    'Farm',
    'Tank',
    'RFID Tag',
    'Animal ID',
    'Cause',
    'Remarks',
    'Operator',
    'Sync Status',
  ];

  const rows = mortalities.map((m) => [
    formatDate(m.createdAt),
    m.farmId,
    m.tankId ?? '',
    m.rfidTag ?? '',
    m.animalId ?? '',
    m.cause,
    m.remarks ?? '',
    m.operatorName,
    m.syncStatus,
  ]);

  return toCSV(headers, rows);
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
