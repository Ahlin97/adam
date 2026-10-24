// Sound (Web Audio beeps), vibration and notifications for the rest timer.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Create/resume the AudioContext. Must be called from a user gesture (e.g. the Klar tap). */
export function unlockAudio(): void {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    // A silent blip fully unlocks audio on iOS Safari.
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0;
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.01);
  } catch {
    /* ignore */
  }
}

/** Three short beeps followed by a longer one. */
export function playBeeps(): void {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    const t0 = c.currentTime + 0.05;
    const beeps: [number, number, number][] = [
      [0, 0.15, 880],
      [0.3, 0.15, 880],
      [0.6, 0.15, 880],
      [0.9, 0.5, 1320],
    ];
    for (const [at, dur, freq] of beeps) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + at + 0.01);
      g.gain.setValueAtTime(0.4, t0 + at + dur - 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(c.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number[] = [300, 150, 300, 150, 600]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

export function requestNotificationPermission(): void {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/** Show a system notification (only when the page is hidden and permission is granted). */
export async function notifyRestOver(body: string): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState !== 'hidden') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
      body,
      tag: 'rest-timer',
      renotify: true,
      vibrate: [300, 150, 300],
      icon: '/icon-192.png',
    };
    if (reg) await reg.showNotification('Vilan är slut!', opts);
    else new Notification('Vilan är slut!', opts);
  } catch {
    /* ignore */
  }
}
