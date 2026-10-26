import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { NavigationProvider } from './Navigation'
import { CardPreviewProvider } from './CardPreview'
import { JobAlerts } from './JobAlerts'
import './tokens.css'
import './styles.css'
import './workspace.css'

const root = document.getElementById('root')
if (!root) throw new Error('Elemento principale non disponibile')
createRoot(root).render(
  <React.StrictMode>
    <NavigationProvider>{(entryId) => <><CardPreviewProvider key={entryId}><App /></CardPreviewProvider><JobAlerts /></>}</NavigationProvider>
  </React.StrictMode>
)
