import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n/I18nContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ToastContainer';
import './styles/globals.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element #root not found. Make sure index.html has <div id="root"></div>.',
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <App />
        <ToastContainer />
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
