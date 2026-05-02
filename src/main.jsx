/**
 * REACT ENTRY POINT
 *
 * Mounts the App into the DOM. StrictMode is enabled to catch potential issues
 * during development.
 *
 * Theme is initialized BEFORE React renders so the user never sees a flash
 * of the default theme before their saved theme loads.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './hooks/AuthContext';
import { initializeTheme } from './lib/theme';
import './styles/global.css';

// Apply the saved theme to <html> before React renders.
// This avoids a flash of the wrong theme on initial load.
initializeTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
