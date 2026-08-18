import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

console.log('[main.tsx] Initializing renderer process...');

const rootElement = document.getElementById('root');
if (rootElement) {
  console.log('[main.tsx] Mounting React App into #root...');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('[main.tsx] Root DOM element "#root" was not found.');
}
