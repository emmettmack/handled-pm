import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const root = createRoot(document.getElementById('root'));
const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (key) {
  import('./authRoot.jsx').then(({ default: AuthRoot }) => root.render(<AuthRoot publishableKey={key} />));
} else {
  root.render(<App />);
}
