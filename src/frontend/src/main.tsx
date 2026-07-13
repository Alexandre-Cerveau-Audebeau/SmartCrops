import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted per GDPR — no Google Fonts CDN; weights mirror the MUI theme usage: 300–700.
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
// Icon font (Material Symbols Outlined, used via <Sym>) — self-hosted for the
// same GDPR reason; index.css keeps the project's base class overrides.
import 'material-symbols/outlined.css';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
