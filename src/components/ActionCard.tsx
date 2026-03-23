import type { ReactNode } from 'react';

interface ActionCardProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}

export function ActionCard({ icon, title, subtitle, onClick }: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg active:shadow-sm"
    >
      <div className="text-blue-500">{icon}</div>
      <span className="text-sm font-semibold text-gray-800">{title}</span>
      <span className="text-xs text-gray-500">{subtitle}</span>
    </button>
  );
}
