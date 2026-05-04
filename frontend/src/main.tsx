import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'

const initTheme = () => {
  if (typeof window === 'undefined') return
  const stored = localStorage.getItem('theme')
  if (stored === 'dark') {
    document.documentElement.classList.add('dark')
  }
}
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
