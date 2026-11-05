import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css';
import './design.css';
import { setupViewport } from './viewport';
import { applyUiScale } from './uiScale';
import { paintPage, resolveTheme, getAppTheme, applyTypography } from './theme';

// keyboard-safe height + no pinch zoom (must run before the first render)
applyUiScale();                // saved Display size (Profile > Display size)
setupViewport();
applyTypography();
paintPage(resolveTheme(getAppTheme()));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// offline support: keeps the app shell so a dropped connection shows Chatzy's own screen
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
