import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

/**
 * Starts the mock API. Requests that do not match a handler pass through to the
 * network, so pointing VITE_API_BASE_URL at a real backend and setting
 * VITE_ENABLE_MOCKS=false is the only change needed to go live.
 */
export async function startMockApi(): Promise<void> {
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
}
