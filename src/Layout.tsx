import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useActiveSession } from '@/db/hooks';
import { useSyncStatus } from '@/sync/sync';
import { cx } from '@/ui';
import { BarChart3, CalendarDays, ChevronRight, Dumbbell, Flame, Settings2, Sun } from 'lucide-react';

const tabs = [
  { to: '/', label: 'Idag', Icon: Sun },
  { to: '/templates', label: 'Pass', Icon: Dumbbell },
  { to: '/history', label: 'Historik', Icon: CalendarDays },
  { to: '/stats', label: 'Statistik', Icon: BarChart3 },
  { to: '/settings', label: 'Mer', Icon: Settings2 },
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
  // The create flows are focused full-screen steps with their own bottom button.
  const focused = inWorkout || location.pathname.startsWith('/skapa');

  return (
    <>
      <SyncDot />
      <Outlet />
      {active && !focused && (
        <button
          type="button"
          onClick={() => navigate('/workout')}
          className="press fixed inset-x-4 bottom-[5.75rem] z-30 mx-auto mb-[env(safe-area-inset-bottom)] flex min-h-14 max-w-lg items-center gap-3 rounded-2xl bg-accent px-4 text-left text-accent-fg shadow-[0_12px_32px_-12px_rgb(212_255_58/0.7)]"
        >
          <span className="relative flex size-8 items-center justify-center rounded-full bg-accent-fg/10">
            <Flame aria-hidden size={18} />
            <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2.5 animate-ping rounded-full bg-accent-fg/60" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wider opacity-70">Pågående pass</span>
            <span className="block truncate font-extrabold">{active.name}</span>
          </span>
          <span className="flex items-center gap-1 text-sm font-bold">
            Fortsätt <ChevronRight aria-hidden size={18} />
          </span>
        </button>
      )}
      {!focused && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 px-3 pt-2" aria-label="Huvudmeny">
          <ul className="glass mx-auto mb-2 flex max-w-lg rounded-[1.75rem] border border-white/8 p-1.5 shadow-[0_16px_40px_-16px_rgb(0_0_0/0.9)]">
            {tabs.map(({ to, label, Icon }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cx(
                      'press flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.4rem] text-[0.7rem] font-semibold',
                      isActive ? 'bg-fg/12 text-fg' : 'text-muted active:bg-surface-2',
                    )
                  }
                >
                  <Icon aria-hidden size={21} strokeWidth={2.25} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
