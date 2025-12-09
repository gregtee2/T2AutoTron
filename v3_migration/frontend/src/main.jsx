import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Startup info (only show environment, not verbose logs)
if (typeof window.api !== 'undefined') {
  console.log('T2AutoTron running in Electron mode');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
