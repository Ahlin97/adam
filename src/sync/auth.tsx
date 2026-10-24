import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setSyncUser, startSyncLoop } from './sync';

interface AuthState {
  /** true until the persisted session has been read. */
  loading: boolean;
  session: Session | null;
  /** Supabase not configured: app runs purely locally. */
  localOnly: boolean;
}

const AuthContext = createContext<AuthState>({ loading: true, session: null, localOnly: !supabase });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: !!supabase, session: null, localOnly: !supabase });

  useEffect(() => {
    if (!supabase) return;
    startSyncLoop();
    // getSession reads the persisted session from localStorage, so it works offline.
    supabase.auth.getSession().then(({ data }) => {
      setState({ loading: false, session: data.session, localOnly: false });
      void setSyncUser(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, session, localOnly: false });
      void setSyncUser(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
