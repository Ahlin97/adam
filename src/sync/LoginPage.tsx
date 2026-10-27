import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, Card, Field, inputClass } from '@/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function switchTo(next: typeof mode) {
    setMode(next);
    setMessage(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : mode === 'signup'
          ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
          : await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false);
    if (error) setMessage(error.message === 'Invalid login credentials' ? 'Fel e-post eller lösenord.' : error.message);
    else if (mode === 'signup') setMessage('Konto skapat. Bekräfta din e-post om Supabase kräver det och logga sedan in.');
    else if (mode === 'reset') setMessage('Om e-postadressen har ett konto har vi skickat en länk. Öppna den på den här enheten för att välja ett nytt lösenord.');
  }

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-4xl font-black">Gymlogg</h1>
      <p className="mb-6 text-muted">
        {mode === 'reset' ? 'Skriv din e-post så skickar vi en länk för att välja ett nytt lösenord.' : 'Logga dina pass och få veta när det är dags att höja.'}
      </p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-post">
            <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode !== 'reset' && (
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
          )}
          {message && <p className="text-sm text-warn" role="alert">{message}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {mode === 'login' ? 'Logga in' : mode === 'signup' ? 'Skapa konto' : 'Skicka länk'}
          </Button>
          {mode === 'login' && (
            <Button variant="ghost" className="w-full text-muted" onClick={() => switchTo('reset')}>
              Glömt lösenord?
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => switchTo(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Inget konto? Skapa ett' : 'Tillbaka till inloggning'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

/** Shown after opening the reset link: the user is signed in and picks a new password. */
export function NewPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password !== repeat) return setMessage('Lösenorden är inte lika.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage(error.message);
    else onDone();
  }

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-4xl font-black">Nytt lösenord</h1>
      <p className="mb-6 text-muted">Välj ett nytt lösenord för ditt konto.</p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nytt lösenord">
            <input className={inputClass} type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Upprepa lösenordet">
            <input className={inputClass} type="password" autoComplete="new-password" minLength={6} required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </Field>
          {message && <p className="text-sm text-warn" role="alert">{message}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            Spara lösenord
          </Button>
        </form>
      </Card>
    </div>
  );
}
