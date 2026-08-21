import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Menu';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { SessionProvider } from '@/stores/SessionContext';
import { AppRoutes } from '@/routes/AppRoutes';
import { ApiError } from '@/lib/apiClient';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Auth, permission and not-found failures will not succeed on retry.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

export function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <ToastProvider>
          <ConfirmProvider>
            {/* import.meta.env.BASE_URL mirrors vite.config.ts's `base`, so the
                router's basename automatically matches whatever path this is
                served from (root locally, /Quotiva/ on GitHub Pages). */}
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <SessionProvider>
                <AppRoutes />
              </SessionProvider>
            </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
