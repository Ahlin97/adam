// "Skapa gympass": build today's pass and start it right away, or save it for later.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { useSettings } from '@/db/hooks';
import { put } from '@/db/repo';
import { Button } from '@/ui';
import { startSession } from '@/features/workout/start';
import { PassBuilder, type BuiltPass } from './PassBuilder';
import { makeTemplate } from './categories';

export default function CreatePassPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);

  async function save(pass: BuiltPass, start: boolean) {
    setBusy(true);
    try {
      const template = makeTemplate(pass.name, pass.exercises, settings);
      await put('templates', template);
      if (start) {
        await startSession({ templateId: template.id, programId: null });
        navigate('/workout', { replace: true });
      } else {
        navigate('/templates', { replace: true });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <PassBuilder
      title="Skapa gympass"
      onExit={() => navigate(-1)}
      finish={(pass) => (
        <>
          <Button variant="primary" size="xl" className="w-full" disabled={busy || !pass.exercises.length} onClick={() => void save(pass, true)}>
            <Play aria-hidden size={22} fill="currentColor" /> Starta passet
          </Button>
          <Button size="lg" variant="ghost" className="w-full" disabled={busy || !pass.exercises.length} onClick={() => void save(pass, false)}>
            Spara till senare
          </Button>
        </>
      )}
    />
  );
}
