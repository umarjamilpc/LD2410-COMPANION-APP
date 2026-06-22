import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppConfigProvider } from './AppConfigContext';
import { ThemeProvider } from './ThemeContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppConfigProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AppConfigProvider>
    </BrowserRouter>
  </React.StrictMode>
);
