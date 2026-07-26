import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  // Extremely defensive: index.html always ships the #root div, but if
  // something ever strips it, fail loudly instead of silently doing nothing.
  document.body.innerHTML =
    '<p style="font-family: sans-serif; padding: 2rem;">Could not find the #root element to mount the app into.</p>';
} else {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
