// Stopwatch / countdown for time-based exercises (e.g. planka).
import { useEffect, useState } from 'react';
import { Button } from '@/ui';
import { formatDuration } from '@/lib/format';
import { playBeeps, unlockAudio, vibrate } from './alerts';

type Mode = { kind: 'stopwatch'; startedAt: number } | { kind: 'countdown'; endsAt: number; target: number } | null;

export function TimeTool({
  target,
  onResult,
  sound,
  vibration,
}: {
  target: number;
  onResult: (sec: number) => void;
  sound: boolean;
  vibration: boolean;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!mode) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    if (mode?.kind === 'countdown' && now >= mode.endsAt) {
      if (sound) playBeeps();
      if (vibration) vibrate();
      onResult(mode.target);
      setMode(null);
    }
  }, [mode, now, onResult, sound, vibration]);

  if (mode?.kind === 'stopwatch') {
    const sec = Math.floor((now - mode.startedAt) / 1000);
    return (
      <div className="flex items-center gap-3">
        <span className="tabular flex-1 text-center text-4xl font-black" role="timer">
          {formatDuration(sec)}
        </span>
        <Button
          variant="danger"
          size="lg"
          onClick={() => {
            onResult(sec);
            setMode(null);
          }}
        >
          Stopp
        </Button>
      </div>
    );
  }
  if (mode?.kind === 'countdown') {
    const sec = Math.max(0, Math.ceil((mode.endsAt - now) / 1000));
    return (
      <div className="flex items-center gap-3">
        <span className="tabular flex-1 text-center text-4xl font-black" role="timer">
          {formatDuration(sec)}
        </span>
        <Button
          size="lg"
          onClick={() => {
            onResult(Math.round((now - (mode.endsAt - mode.target * 1000)) / 1000));
            setMode(null);
          }}
        >
          Avbryt
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button
        className="flex-1"
        onClick={() => {
          unlockAudio();
          setNow(Date.now());
          setMode({ kind: 'stopwatch', startedAt: Date.now() });
        }}
      >
        ⏱ Stoppur
      </Button>
      <Button
        className="flex-1"
        disabled={target <= 0}
        onClick={() => {
          unlockAudio();
          setNow(Date.now());
          setMode({ kind: 'countdown', endsAt: Date.now() + target * 1000, target });
        }}
      >
        ⏲ Nedräkning {target} s
      </Button>
    </div>
  );
}
