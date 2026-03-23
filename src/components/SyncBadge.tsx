import { useOnlineStatus } from '../sync/useOnlineStatus';
import { useSyncStatus } from '../sync/useSyncStatus';
import clsx from 'clsx';

export function SyncBadge() {
  const isOnline = useOnlineStatus();
  const { pendingCount } = useSyncStatus();

  const color = !isOnline
    ? 'bg-red-500'
    : pendingCount > 0
      ? 'bg-orange-400'
      : 'bg-green-500';

  return (
    <span
      className={clsx('inline-block h-3 w-3 rounded-full', color)}
      title={
        !isOnline
          ? 'Offline'
          : pendingCount > 0
            ? `${pendingCount} pending`
            : 'Synced'
      }
    />
  );
}
