import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css';
import './design.css';
import { setupViewport } from './viewport';
import { paintPage, resolveTheme, getAppTheme } from './theme';

// keyboard-safe height + no pinch zoom (must run before the first render)
setupViewport();
paintPage(resolveTheme(getAppTheme()));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
