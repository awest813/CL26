import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './pages/Layout';
import Home from './pages/Home';

// The shell and Home ship in the first download; every other page loads the first time it is
// opened, so the app starts faster and only pays for the screens a coach visits.
const ConferencesPage = lazy(() => import('./pages/ConferencesPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const RankingsPage = lazy(() => import('./pages/RankingsPage'));
const ExhibitionPage = lazy(() => import('./pages/ExhibitionPage'));
const CoachCareerSetupPage = lazy(() => import('./pages/CoachCareerSetupPage'));
const CoachCareerPage = lazy(() => import('./pages/CoachCareerPage'));
const SeasonPage = lazy(() => import('./pages/SeasonPage'));
const SeasonStandingsPage = lazy(() => import('./pages/SeasonStandingsPage'));
const LeadersPage = lazy(() => import('./pages/LeadersPage'));
const SeasonWeekPage = lazy(() => import('./pages/SeasonWeekPage'));
const PlayoffsPage = lazy(() => import('./pages/PlayoffsPage'));
const AlphaStagePage = lazy(() => import('./pages/AlphaStagePage'));
const RosterPage = lazy(() => import('./pages/RosterPage'));
const WeeklyHubPage = lazy(() => import('./pages/WeeklyHubPage'));
const RecruitingBoardPage = lazy(() => import('./pages/RecruitingBoardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

/** A lazily loaded page, with a quiet placeholder while its code arrives. */
function page(Component: ComponentType) {
  return (
    <Suspense fallback={<div className="pageLoading" role="status" aria-live="polite">Loading…</div>}>
      <Component />
    </Suspense>
  );
}
import './App.css';

function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return base === '' ? undefined : base
}

// Created once, outside render, so the router keeps its state across App re-renders.
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'conferences', element: page(ConferencesPage) },
      { path: 'team/:id', element: page(TeamPage) },
      { path: 'rankings', element: page(RankingsPage) },
      { path: 'exhibition', element: page(ExhibitionPage) },
      { path: 'login', element: <Navigate to="/" replace /> },
      { path: 'career', element: page(CoachCareerPage) },
      { path: 'career/setup', element: page(CoachCareerSetupPage) },
      { path: 'career/roster', element: page(RosterPage) },
      { path: 'career/week', element: page(WeeklyHubPage) },
      { path: 'career/recruiting', element: page(RecruitingBoardPage) },
      { path: 'season', element: page(SeasonPage) },
      { path: 'schedule', element: <Navigate to="/season" replace /> },
      { path: 'season/standings', element: page(SeasonStandingsPage) },
      { path: 'season/leaders', element: page(LeadersPage) },
      { path: 'season/week/:weekIndex', element: page(SeasonWeekPage) },
      { path: 'playoffs', element: page(PlayoffsPage) },
      { path: 'alpha', element: page(AlphaStagePage) },
      { path: 'settings', element: page(SettingsPage) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
], { basename: routerBasename() });

function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </ErrorBoundary>
  );
}

export default App;
