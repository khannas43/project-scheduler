import { Outlet, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';

import { AppShell } from './components/AppShell.js';
import { LoginPage, RequireAuth } from './features/auth/index.js';
import { ProjectListPage, ProjectSettingsPage } from './features/projects/index.js';
import { PortfolioDashboardPage, ProjectDashboardPage } from './features/dashboard/index.js';
import { HelpPage } from './features/help/index.js';
import { ActivityPage } from './features/activity/index.js';
import { ResourceCalendarPage, ResourceSheet } from './features/resources/index.js';
import { PeoplePage } from './features/people/index.js';
import { RolesPage } from './features/roles/index.js';
import { BoardPage, BacklogPage } from './features/board/index.js';
import { AgileChartsPage } from './features/charts/index.js';
import { ReportsPage } from './features/reports/index.js';
import { ProjectDetailPage } from './features/tasks/index.js';
import { BaselinesPage } from './features/tracking/index.js';
import { useAuthStore } from './stores/authStore.js';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const token = useAuthStore.getState().accessToken;
    throw redirect({ to: token ? '/projects' : '/login' });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authenticated',
  component: RequireAuth,
});

const shellRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: '_shell',
  component: AppShell,
});

const projectsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects',
  component: ProjectListPage,
});

const portfolioDashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/dashboard',
  component: PortfolioDashboardPage,
});

const helpRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/help',
  component: HelpPage,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId',
  component: ProjectDetailPage,
});

const projectPeopleRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/people',
  component: PeoplePage,
});

const projectRolesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/roles',
  component: RolesPage,
});

const projectResourcesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/resources',
  component: ResourceSheet,
});

const projectResourceCalendarRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/resources/$resourceId',
  component: ResourceCalendarPage,
});

const projectBaselinesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/baselines',
  component: BaselinesPage,
});

const projectReportsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/reports',
  component: ReportsPage,
});

const projectActivityRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/activity',
  component: ActivityPage,
});

const projectBoardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/board',
  component: BoardPage,
});

const projectBacklogRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/backlog',
  component: BacklogPage,
});

const projectAgileChartsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/agile-charts',
  component: AgileChartsPage,
});

const projectDashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/dashboard',
  component: ProjectDashboardPage,
});

const projectSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId/settings',
  component: ProjectSettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authenticatedRoute.addChildren([
    shellRoute.addChildren([
      projectsRoute,
      portfolioDashboardRoute,
      helpRoute,
      projectDetailRoute,
      projectPeopleRoute,
      projectRolesRoute,
      projectResourcesRoute,
      projectResourceCalendarRoute,
      projectBaselinesRoute,
      projectReportsRoute,
      projectActivityRoute,
      projectBoardRoute,
      projectBacklogRoute,
      projectAgileChartsRoute,
      projectDashboardRoute,
      projectSettingsRoute,
    ]),
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
