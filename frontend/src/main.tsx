import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppRefresh } from './components/AppRefresh';
import { AskHost } from './components/Ask';
import { ToastHost } from './components/Toast';
import { registerServiceWorker } from './push-client';
import './theme.css';

registerServiceWorker(); // §9.1 — push only; it never caches the app (§8.10)
createRoot(document.getElementById('root')!).render(
  <StrictMode><AskHost><ToastHost><AppRefresh /><App /></ToastHost></AskHost></StrictMode>, // §8 asking and telling, §8.10
);
