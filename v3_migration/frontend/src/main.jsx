import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

console.log('=== T2AutoTron Starting ===');
console.log('Running in:', typeof window.api !== 'undefined' ? 'Electron' : 'Browser');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
