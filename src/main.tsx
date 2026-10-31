import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { refreshAppCacheOnLaunch } from './lib/cache';

// Refresh SW / caches on every app start
void refreshAppCacheOnLaunch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
