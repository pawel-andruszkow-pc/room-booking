import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { configure } from 'mobx';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RootStore } from './stores/RootStore';
import { StoreProvider } from './stores/StoreContext';
import { installMockApi } from './dev/mockApi';
import './index.css';

// Surface accidental out-of-action mutations during development.
configure({ enforceActions: 'observed' });

// `?mock` answers /api in the browser (see dev/mockApi.ts); only on localhost,
// never in a build.
if (import.meta.env.DEV) installMockApi();

const store = new RootStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreProvider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);
