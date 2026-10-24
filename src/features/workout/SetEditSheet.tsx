// Edit (or add) a logged set. Used in the workout logger and in history.
import { useState } from 'react';
import type { Exercise, SetType, Settings } from '@/engine';
import { Button, Sheet } from '@/ui';
import { NumberStepper, RpePicker, SetTypePicker, WeightStepper } from './inputs';
import { stepFor } from './safeEngine';
import { isTime, weightLabel } from './setFormat';

export interface SetValues {
  type: SetType;
  reps: number;
  weight: number; // kg
  durationSec: number | null;
  rpe: number | null;
}

export function SetEditSheet({
  open,
  onClose,
  title,
  initial,
  exercise,
  settings,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: SetValues;
  exercise: Exercise | undefined;
  settings: Settings;
  onSave: (v: SetValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open && <Body initial={initial} exercise={exercise} settings={settings} onSave={onSave} onDelete={onDelete} onClose={onClose} />}
    </Sheet>
  );
}

function Body({
  initial,
  exercise,
  settings,
  onSave,
  onDelete,
  onClose,
}: {
  initial: SetValues;
  exercise: Exercise | undefined;
  settings: Settings;
  onSave: (v: SetValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [v, setV] = useState<SetValues>(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const time = isTime(exercise);
  const step = exercise ? stepFor(exercise, settings) : 2.5;
  const showWeight = !time;
  return (
    <div className="space-y-5">
      <SetTypePicker value={v.type} onChange={(type) => setV({ ...v, type })} />
      {showWeight && (
        <WeightStepper
          label={weightLabel(exercise, settings.unit)}
          kg={v.weight}
          stepKg={step}
          unit={settings.unit}
          onChange={(weight) => setV({ ...v, weight })}
        />
      )}
      {time ? (
        <NumberStepper
          label="Tid (sekunder)"
          value={v.durationSec ?? 0}
          step={5}
          suffix="s"
          decimals={0}
          onChange={(d) => setV({ ...v, durationSec: Math.round(d) })}
        />
      ) : (
        <NumberStepper label="Reps" value={v.reps} step={1} decimals={0} onChange={(reps) => setV({ ...v, reps: Math.round(reps) })} />
      )}
      <div>
        <div className="mb-2 text-sm text-muted">RPE (valfritt)</div>
        <RpePicker value={v.rpe} onChange={(rpe) => setV({ ...v, rpe })} />
      </div>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={async () => {
          await onSave(time ? { ...v, reps: 0, weight: 0 } : v);
          onClose();
        }}
      >
        Spara
      </Button>
      {onDelete &&
        (confirmDelete ? (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setConfirmDelete(false)}>
              Avbryt
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                await onDelete();
                onClose();
              }}
            >
              Ja, ta bort
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="w-full text-bad" onClick={() => setConfirmDelete(true)}>
            Ta bort set
          </Button>
        ))}
    </div>
  );
}
