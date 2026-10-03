import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppRefresh } from './components/AppRefresh';
import './theme.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AppRefresh /><App /></StrictMode>);
