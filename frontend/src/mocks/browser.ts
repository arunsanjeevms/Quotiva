import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

/**
 * Starts the mock API. Requests that do not match a handler still pass through
 * to the network, so pointing VITE_API_BASE_URL at a real backend and setting
 * VITE_ENABLE_MOCKS=false is the only change needed to go live.
 *
 * `warn` rather than `bypass`: an unhandled request in mock mode carries the
 * fake session token to whatever real backend is configured, which comes back
 * as a 401 and signs the user out. That failure is confusing precisely because
 * every *handled* call still works, so it must not be silent.
 */
export async function startMockApi(): Promise<void> {
  console.warn(
    '[quotiva] Mock API enabled (VITE_ENABLE_MOCKS=true). Auth and data are fake; set it to "false" to use the real backend.',
  );
  await worker.start({
    onUnhandledRequest: 'warn',
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
}
