import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/calendar-v13.css';
import { refreshAppCacheOnLaunch } from './lib/cache';

// Refresh Service Worker and old caches at every launch.
void refreshAppCacheOnLaunch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
