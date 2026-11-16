import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
// Installierbare App: Service Worker nur im veröffentlichten Build registrieren,
// damit er die lokale Entwicklung nicht mit gespeicherten Dateien stört.
const env = (import.meta as any).env;
if (env?.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${env.BASE_URL}sw.js`).catch((error) => {
      console.warn('Service Worker konnte nicht registriert werden:', error);
    });
  });
}
