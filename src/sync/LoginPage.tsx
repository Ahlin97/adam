import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, Card, Field, inputClass } from '@/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) setMessage(error.message === 'Invalid login credentials' ? 'Fel e-post eller lösenord.' : error.message);
    else if (mode === 'signup') setMessage('Konto skapat. Bekräfta din e-post om Supabase kräver det och logga sedan in.');
  }

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-4xl font-black">Gymlogg</h1>
      <p className="mb-6 text-muted">Logga dina pass och få veta när det är dags att höja.</p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-post">
            <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Lösenord">
            <input
              className={inputClass}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {message && <p className="text-sm text-warn" role="alert">{message}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {mode === 'login' ? 'Logga in' : 'Skapa konto'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Inget konto? Skapa ett' : 'Har du konto? Logga in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
