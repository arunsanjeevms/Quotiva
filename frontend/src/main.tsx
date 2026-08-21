import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MOCKS_ENABLED } from './services/auth';
import './styles/globals.css';

async function bootstrap(): Promise<void> {
  // The mock API is intercepted at the network layer, so the application's own
  // fetch code is identical whether it is running against mocks or a real API.
  if (MOCKS_ENABLED) {
    const { startMockApi } = await import('./mocks/browser');
    await startMockApi();
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('Root element not found');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
