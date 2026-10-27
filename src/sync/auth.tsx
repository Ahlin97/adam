import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setSyncUser, startSyncLoop } from './sync';

interface AuthState {
  /** true until the persisted session has been read. */
  loading: boolean;
  session: Session | null;
  /** Supabase not configured: app runs purely locally. */
  localOnly: boolean;
  /** Opened from a password-reset email: the user must choose a new password first. */
  recovery: boolean;
  endRecovery: () => void;
}

const AuthContext = createContext<AuthState>({ loading: true, session: null, localOnly: !supabase, recovery: false, endRecovery: () => {} });
export const useAuth = () => useContext(AuthContext);

type Base = Omit<AuthState, 'recovery' | 'endRecovery'>;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Base>({ loading: !!supabase, session: null, localOnly: !supabase });
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    startSyncLoop();
    // getSession reads the persisted session from localStorage, so it works offline.
    // On startup, wait (max 4 s) for the first pull so a new device sees synced data before
    // seeding starter content; offline this returns immediately.
    supabase.auth.getSession().then(async ({ data }) => {
      await Promise.race([setSyncUser(data.session?.user.id ?? null), new Promise((r) => setTimeout(r, 4000))]);
      setState({ loading: false, session: data.session, localOnly: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // The reset link signs the user in and fires PASSWORD_RECOVERY; ask for a new password first.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setState({ loading: false, session, localOnly: false });
      void setSyncUser(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo(() => ({ ...state, recovery, endRecovery: () => setRecovery(false) }), [state, recovery]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
