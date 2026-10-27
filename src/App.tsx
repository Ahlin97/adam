import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import { AuthProvider, useAuth } from './sync/auth';
import LoginPage from './sync/LoginPage';
import { ensureSeeded } from './data/seed';
import HomePage from './features/home/HomePage';
import ExercisesPage from './features/library/ExercisesPage';
import ExerciseEditPage from './features/library/ExerciseEditPage';
import TemplatesPage from './features/templates/TemplatesPage';
import TemplateEditPage from './features/templates/TemplateEditPage';
import ProgramsPage from './features/programs/ProgramsPage';
import ProgramEditPage from './features/programs/ProgramEditPage';
import CreatePassPage from './features/create/CreatePassPage';
import CreateSchemaPage from './features/create/CreateSchemaPage';
import WorkoutPage from './features/workout/WorkoutPage';
import SummaryPage from './features/workout/SummaryPage';
import HistoryPage from './features/history/HistoryPage';
import SessionDetailPage from './features/history/SessionDetailPage';
import StatsPage from './features/stats/StatsPage';
import ExerciseStatsPage from './features/stats/ExerciseStatsPage';
import SettingsPage from './features/settings/SettingsPage';

function Gate() {
  const { loading, session, localOnly } = useAuth();
  const [seeded, setSeeded] = useState(false);
  const ready = localOnly || !!session;

  useEffect(() => {
    if (ready) void ensureSeeded().finally(() => setSeeded(true));
  }, [ready]);

  if (loading) return null;
  if (!ready) return <LoginPage />;
  if (!seeded) return null;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="exercises" element={<ExercisesPage />} />
        <Route path="exercises/:id" element={<ExerciseEditPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/:id" element={<TemplateEditPage />} />
        <Route path="programs" element={<ProgramsPage />} />
        <Route path="programs/plan" element={<Navigate to="/skapa/schema" replace />} />
        <Route path="skapa/schema" element={<CreateSchemaPage />} />
        <Route path="skapa/pass" element={<CreatePassPage />} />
        <Route path="programs/:id" element={<ProgramEditPage />} />
        <Route path="workout" element={<WorkoutPage />} />
        <Route path="workout/summary/:id" element={<SummaryPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="history/:id" element={<SessionDetailPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="stats/exercise/:id" element={<ExerciseStatsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
