export interface Alert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  title: string;
  message: string;
  farm?: string;
  tank?: string;
  timestamp: string;
  acknowledged: boolean;
}

export const mockAlerts: Alert[] = [
  {
    id: 'alert-1',
    type: 'critical',
    title: 'Mortality spike detected',
    message:
      'Mortality rate increased 40% this week. Check water quality parameters immediately.',
    farm: 'Chanthaburi Farm',
    tank: 'TNK-B1',
    timestamp: '2 hours ago',
    acknowledged: false,
  },
  {
    id: 'alert-2',
    type: 'warning',
    title: 'Below-average growth',
    message:
      'Average weight 15% below expected growth curve. Consider feed adjustment.',
    farm: 'Bang Pla Farm',
    tank: 'TNK-A2',
    timestamp: '5 hours ago',
    acknowledged: false,
  },
  {
    id: 'alert-3',
    type: 'warning',
    title: 'High temperature recorded',
    message: 'Water temperature exceeded 32°C threshold.',
    farm: 'Surat Thani Farm',
    tank: 'TNK-A1',
    timestamp: '8 hours ago',
    acknowledged: false,
  },
  {
    id: 'alert-4',
    type: 'info',
    title: 'Growth milestone reached',
    message: 'Animals reached 20g average weight ahead of schedule.',
    farm: 'Bang Pla Farm',
    tank: 'TNK-A1',
    timestamp: '1 day ago',
    acknowledged: false,
  },
  {
    id: 'alert-5',
    type: 'info',
    title: 'Sync completed',
    message: 'All pending records synced successfully.',
    timestamp: '1 day ago',
    acknowledged: false,
  },
  {
    id: 'alert-6',
    type: 'warning',
    title: 'Low dissolved oxygen',
    message: 'DO levels dropped below 4 mg/L. Increase aeration.',
    farm: 'Chanthaburi Farm',
    tank: 'TNK-B1',
    timestamp: '3 hours ago',
    acknowledged: false,
  },
];
