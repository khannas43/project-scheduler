import { Outlet, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';

import { AppShell } from './components/AppShell.js';
import { LoginPage, RequireAuth } from './features/auth/index.js';
import { ProjectListPage } from './features/projects/index.js';
import { ResourceSheet } from './features/resources/index.js';
import { RolesPage } from './features/roles/index.js';
import { ProjectDetailPage } from './features/tasks/index.js';
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

const projectDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects/$projectId',
  component: ProjectDetailPage,
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authenticatedRoute.addChildren([
    shellRoute.addChildren([
      projectsRoute,
      projectDetailRoute,
      projectRolesRoute,
      projectResourcesRoute,
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
