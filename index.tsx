import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';

const mountApp = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error("Critical Error: Could not find root element to mount to");
    return;
  }

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    );
  } catch (error: any) {
    console.error("Failed to render React app:", error?.message || error);
    rootElement.innerHTML = `
      <div style="padding: 2rem; color: white; background: #0f172a; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-family: sans-serif;">
        <h1 style="color: #ef4444; font-size: 1.5rem; margin-bottom: 1rem;">Zenith Engine Initialization Error</h1>
        <p style="color: #94a3b8; max-width: 400px; line-height: 1.5;">The playback matrix failed to stabilize. This is often caused by script loading conflicts.</p>
        <button onclick="window.location.reload()" style="margin-top: 2rem; padding: 0.75rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: bold;">
          Attempt Hot Reload
        </button>
      </div>
    `;
  }
};

// Ensure DOM is fully ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  mountApp();
}