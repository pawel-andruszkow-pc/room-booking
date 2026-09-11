import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { configure } from 'mobx';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RootStore } from './stores/RootStore';
import { StoreProvider } from './stores/StoreContext';
import './index.css';

// Surface accidental out-of-action mutations during development.
configure({ enforceActions: 'observed' });

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
