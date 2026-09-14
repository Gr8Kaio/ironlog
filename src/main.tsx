import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { syncAppHeight } from './lib/viewport';
import './index.css';

syncAppHeight();

// HashRouter, not BrowserRouter: GitHub Pages has no way to rewrite deep links
// back to index.html, and a refresh on /progress would 404 without it.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
