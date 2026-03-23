import type { ReactNode } from 'react';

export function AppBackground({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-[calc(100vh-56px)] bg-white bg-bottom bg-no-repeat"
      style={{
        backgroundImage: 'url(/hand-shrimp-bg.jpg)',
        backgroundSize: '100% auto',
      }}
    >
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
