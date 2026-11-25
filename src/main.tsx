import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/eb-garamond/500.css'
import '@fontsource/eb-garamond/500-italic.css'
import '@fontsource/eb-garamond/600.css'
import '@fontsource/eb-garamond/700.css'
import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import './styles/app.css'
import { App } from './App'
import { registerSW } from 'virtual:pwa-register'
import { refreshStaleData } from './lib/datasync'

registerSW({ immediate: true })

// data kept on the phone that has changed since: replaced (a little after start, so the first page comes first)
setTimeout(() => void refreshStaleData().catch(() => {}), 2500)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
