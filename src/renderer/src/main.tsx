import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './workspace.css'

const root = document.getElementById('root')
if (!root) throw new Error('Elemento principale non disponibile')
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
