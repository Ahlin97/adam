import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useActiveSession } from '@/db/hooks';
import { useSyncStatus } from '@/sync/sync';
import { cx } from '@/ui';

const tabs = [
  { to: '/', label: 'Idag', icon: '◉' },
  { to: '/templates', label: 'Pass', icon: '☰' },
  { to: '/history', label: 'Historik', icon: '⟲' },
  { to: '/stats', label: 'Statistik', icon: '▤' },
  { to: '/settings', label: 'Mer', icon: '⚙' },
];

function SyncDot() {
  const { state } = useSyncStatus();
  if (state === 'idle' || state === 'local-only' || state === 'signed-out') return null;
  const label = { syncing: 'Synkar…', offline: 'Offline – sparas lokalt', error: 'Synkfel – försöker igen' }[state];
  return (
    <div className="pt-safe fixed inset-x-0 top-0 z-30 pointer-events-none flex justify-center">
      <span className={cx('mt-1 rounded-full px-3 py-0.5 text-xs', state === 'error' ? 'bg-bad text-white' : 'bg-surface-2 text-muted')}>
        {label}
      </span>
    </div>
  );
}

export default function Layout() {
  const active = useActiveSession();
  const location = useLocation();
  const navigate = useNavigate();
  const inWorkout = location.pathname.startsWith('/workout');

  return (
    <>
      <SyncDot />
      <Outlet />
      {active && !inWorkout && (
        <button
          type="button"
          onClick={() => navigate('/workout')}
          className="fixed inset-x-3 bottom-20 z-30 mb-[env(safe-area-inset-bottom)] min-h-14 rounded-2xl bg-good px-4 text-left font-bold text-black shadow-lg"
        >
          Pågående pass: {active.name} – fortsätt ›
        </button>
      )}
      {!inWorkout && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur" aria-label="Huvudmeny">
          <ul className="mx-auto flex max-w-xl">
            {tabs.map((t) => (
              <li key={t.to} className="flex-1">
                <NavLink
                  to={t.to}
                  end={t.to === '/'}
                  className={({ isActive }) =>
                    cx('flex min-h-16 flex-col items-center justify-center text-xs', isActive ? 'text-accent' : 'text-muted')
                  }
                >
                  <span aria-hidden className="text-xl leading-none">{t.icon}</span>
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
