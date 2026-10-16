import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { start } from './app/ipc';
import './styles/style.css';
import './styles/layout.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
start();
