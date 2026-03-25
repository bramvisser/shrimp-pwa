import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeftIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { SyncBadge } from './SyncBadge';

export function AppTopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/home';

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div className="w-10">
          {!isHome && (
            <button onClick={() => navigate(-1)} className="p-1 text-gray-600">
              <ArrowLeftIcon className="h-6 w-6" />
            </button>
          )}
        </div>

        <img src="/logo.jpg" alt="Shrimp App" className="h-8 rounded" />

        <div className="flex w-10 items-center justify-end gap-2">
          <SyncBadge />
          {isHome && (
            <button onClick={() => navigate('/settings')} className="p-1 text-gray-600">
              <Cog6ToothIcon className="h-6 w-6" />
            </button>
          )}
        </div>
      </header>
      <div className="h-14" />
    </>
  );
}
