import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { NavigationProvider } from './Navigation'
import './tokens.css'
import './styles.css'
import './workspace.css'

const root = document.getElementById('root')
if (!root) throw new Error('Elemento principale non disponibile')
createRoot(root).render(
  <React.StrictMode>
    <NavigationProvider>{(entryId) => <App key={entryId} />}</NavigationProvider>
  </React.StrictMode>
)
