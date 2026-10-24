// Timestamp-based rest timer persisted in db.meta so it survives reloads, backgrounding and screen lock.
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Settings } from '@/engine';
import { notifyRestOver, playBeeps, vibrate } from './alerts';

const KEY = 'restTimer';

export interface RestState {
  sessionId: string;
  /** epoch ms */
  endsAt: number;
  totalSec: number;
  /** e.g. "Bänkpress 8 × 82,5 kg" */
  nextLabel: string;
  /** epoch ms when the end alarm fired, null while running. */
  firedAt: number | null;
}

export async function startRest(sessionId: string, seconds: number, nextLabel: string): Promise<void> {
  const state: RestState = { sessionId, endsAt: Date.now() + seconds * 1000, totalSec: seconds, nextLabel, firedAt: null };
  await db.meta.put({ key: KEY, value: state });
}

export async function adjustRest(deltaSec: number): Promise<void> {
  const row = await db.meta.get(KEY);
  const s = row?.value as RestState | undefined;
  if (!s || s.firedAt) return;
  const endsAt = Math.max(Date.now(), s.endsAt + deltaSec * 1000);
  await db.meta.put({ key: KEY, value: { ...s, endsAt, totalSec: Math.max(1, s.totalSec + deltaSec) } });
}

export async function clearRest(): Promise<void> {
  await db.meta.delete(KEY);
}

async function markFired(): Promise<void> {
  const row = await db.meta.get(KEY);
  const s = row?.value as RestState | undefined;
  if (s && !s.firedAt) await db.meta.put({ key: KEY, value: { ...s, firedAt: Date.now() } });
}

export type RestPhase = 'idle' | 'running' | 'done';

/** Live rest timer. Fires sound/vibration/notification once when it reaches zero. */
export function useRestTimer(sessionId: string | undefined, settings: Settings) {
  const state = useLiveQuery(async () => ((await db.meta.get(KEY))?.value as RestState | undefined) ?? null, []);
  const [now, setNow] = useState(() => Date.now());
  const firing = useRef(false);

  const s = state && state.sessionId === sessionId ? state : null;
  const running = !!s && !s.firedAt;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [running]);

  const remainingMs = s ? Math.max(0, s.endsAt - now) : 0;

  useEffect(() => {
    if (!s || s.firedAt || remainingMs > 0 || firing.current) return;
    firing.current = true;
    // Only make noise if it ended recently (not when reopening the app much later).
    const recent = Date.now() - s.endsAt < 60_000;
    if (recent) {
      if (settings.soundEnabled) playBeeps();
      if (settings.vibrationEnabled) vibrate();
      void notifyRestOver(s.nextLabel ? `Nästa: ${s.nextLabel}` : 'Dags för nästa set');
    }
    void (recent ? markFired() : clearRest()).finally(() => {
      firing.current = false;
    });
  }, [s, remainingMs, settings.soundEnabled, settings.vibrationEnabled]);

  // Auto-dismiss the "done" signal after a few seconds.
  const firedAt = s?.firedAt ?? null;
  useEffect(() => {
    if (!firedAt) return;
    const left = Math.max(0, 6000 - (Date.now() - firedAt));
    const t = setTimeout(() => void clearRest(), left);
    return () => clearTimeout(t);
  }, [firedAt]);

  const phase: RestPhase = !s ? 'idle' : s.firedAt ? 'done' : 'running';
  return { phase, state: s, remainingMs };
}
