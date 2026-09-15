import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import './styles/variables.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/animations.css';
import './styles/admin.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
