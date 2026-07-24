import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AuthBootstrap } from './features/auth/index.js';
import { createQueryClient } from './lib/queryClient.js';
import { router } from './router.js';
import './styles.css';

const queryClient = createQueryClient();
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root missing');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>
        <RouterProvider router={router} />
      </AuthBootstrap>
    </QueryClientProvider>
  </StrictMode>,
);
