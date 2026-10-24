// Personal API keys for the Apple Watch / Shortcuts API (supabase/functions/watch).
// Only the SHA-256 hash of a key is stored; the full key is shown once when created.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { functionsUrl, supabase } from '@/lib/supabase';
import { useAuth } from '@/sync/auth';
import { formatDate, formatTime } from '@/lib/format';
import { Button, Card, Field, inputClass, Sheet } from '@/ui';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `gl_${base64url(bytes)}`;
}

const when = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      aria-label={`Kopiera ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt(`Kopiera ${label}:`, value);
        }
      }}
    >
      {copied ? 'Kopierat ✓' : 'Kopiera'}
    </Button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-surface-2 p-3 text-sm">{value}</code>
        <CopyButton value={value} label={label.toLowerCase()} />
      </div>
    </div>
  );
}

export default function ApiKeysSection() {
  const { session, localOnly, loading: authLoading } = useAuth();
  const online = useOnline();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('Apple Watch');
  const [newKey, setNewKey] = useState<string | null>(null);

  const userId = session?.user.id ?? null;
  const endpoint = functionsUrl ? `${functionsUrl}/watch` : null;

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data, error: err } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at')
      .order('created_at', { ascending: false });
    if (err) setError(`Kunde inte hämta nycklar: ${err.message}`);
    else {
      setError(null);
      setKeys((data ?? []) as ApiKeyRow[]);
    }
  }, [userId]);

  useEffect(() => {
    if (online) void load();
  }, [load, online]);

  if (localOnly || !supabase) {
    return (
      <Card>
        <p className="font-semibold">Kräver Supabase-inloggning</p>
        <p className="mt-1 text-sm text-muted">
          Klock-API:t körs som en Supabase Edge Function. Konfigurera Supabase och logga in för att skapa en API-nyckel.
        </p>
      </Card>
    );
  }
  if (authLoading) return null;
  if (!userId) {
    return (
      <Card>
        <p className="font-semibold">Kräver Supabase-inloggning</p>
        <p className="mt-1 text-sm text-muted">Logga in för att skapa en API-nyckel till Apple Watch-genvägen.</p>
      </Card>
    );
  }

  async function createKey() {
    if (!supabase || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const key = generateApiKey();
      const { error: err } = await supabase.from('api_keys').insert({
        user_id: userId,
        name: name.trim() || 'Apple Watch',
        key_hash: await sha256Hex(key),
        key_prefix: key.slice(0, 8),
      });
      if (err) throw err;
      setNewKey(key);
      await load();
    } catch (e) {
      setError(`Kunde inte skapa nyckel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: ApiKeyRow) {
    if (!supabase) return;
    if (!window.confirm(`Återkalla nyckeln "${row.name}" (${row.key_prefix}…)? Genvägar som använder den slutar fungera.`)) return;
    setBusy(true);
    const { error: err } = await supabase.from('api_keys').delete().eq('id', row.id);
    setBusy(false);
    if (err) setError(`Kunde inte återkalla nyckel: ${err.message}`);
    else await load();
  }

  function closeSheet() {
    setSheetOpen(false);
    setNewKey(null);
    setName('Apple Watch');
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Logga set från klockan med en Genväg (Shortcuts). Genvägen använder en personlig API-nyckel – se guiden i
        docs/APPLE_WATCH.md för hur du bygger den steg för steg.
      </p>

      {endpoint && <CopyRow label="Adress (URL)" value={endpoint} />}

      {!online && (
        <Card className="border-warn" role="status">
          <p className="font-semibold">Du är offline</p>
          <p className="mt-1 text-sm text-muted">API-nycklar hanteras direkt i Supabase och kräver nätverk.</p>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      {keys && keys.length === 0 && <p className="text-sm text-muted">Inga API-nycklar ännu.</p>}
      {keys && keys.length > 0 && (
        <ul className="space-y-2" aria-label="API-nycklar">
          {keys.map((k) => (
            <li key={k.id}>
              <Card className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{k.name}</div>
                  <div className="text-sm text-muted">
                    <code>{k.key_prefix}…</code> · skapad {when(k.created_at)}
                  </div>
                  <div className="text-sm text-muted">
                    {k.last_used_at ? `Senast använd ${when(k.last_used_at)}` : 'Aldrig använd'}
                  </div>
                </div>
                <Button variant="danger" size="sm" disabled={!online || busy} onClick={() => void revoke(k)}>
                  Återkalla
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Button variant="primary" className="w-full" disabled={!online} onClick={() => setSheetOpen(true)}>
        Skapa API-nyckel
      </Button>

      <Sheet open={sheetOpen} onClose={closeSheet} title={newKey ? 'Din nya API-nyckel' : 'Ny API-nyckel'}>
        {newKey ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-warn p-3 text-sm">
              Kopiera nyckeln nu – den visas bara en gång. Klistra in den i Genvägen som värde för headern{' '}
              <code>x-api-key</code>.
            </p>
            <CopyRow label="API-nyckel" value={newKey} />
            {endpoint && <CopyRow label="Nästa set (URL)" value={`${endpoint}/next?start=1`} />}
            {endpoint && <CopyRow label="Logga set (URL, POST)" value={`${endpoint}/log`} />}
            {endpoint && <CopyRow label="Avsluta pass (URL, POST)" value={`${endpoint}/finish`} />}
            <Button variant="primary" className="w-full" onClick={closeSheet}>
              Klar
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void createKey();
            }}
          >
            <Field label="Namn" hint="T.ex. vilken enhet eller genväg nyckeln används i.">
              <input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            {!online && <p className="text-sm text-bad">Du är offline – anslut till nätet för att skapa en nyckel.</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={!online || busy}>
              {busy ? 'Skapar…' : 'Skapa nyckel'}
            </Button>
          </form>
        )}
      </Sheet>
    </div>
  );
}
