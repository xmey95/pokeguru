import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { NavigationProvider } from './Navigation'
import { CardPreviewProvider } from './CardPreview'
import { JobAlerts } from './JobAlerts'
import './tokens.css'
import './styles.css'
import './workspace.css'

// Record only durations. No route, card, project or conversation content crosses IPC.
if (typeof PerformanceObserver !== 'undefined') {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 50) void window.projectsApi.recordUiLongTask(entry.duration)
      }
    })
    observer.observe({ type: 'longtask', buffered: true })
  } catch { /* Long Task API is optional on some Chromium builds. */ }
}

const root = document.getElementById('root')
if (!root) throw new Error('Elemento principale non disponibile')
createRoot(root).render(
  <React.StrictMode>
    <NavigationProvider>{(entryId) => <><CardPreviewProvider key={entryId}><App /></CardPreviewProvider><JobAlerts /></>}</NavigationProvider>
  </React.StrictMode>
)
