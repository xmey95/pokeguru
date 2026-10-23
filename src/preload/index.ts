import { contextBridge, ipcRenderer } from 'electron'
import type { ProjectsApi } from '../shared/projects'

const api: ProjectsApi = {
  getCatalog: () => ipcRenderer.invoke('catalog:get'),
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  openCatalogSource: (url) => ipcRenderer.invoke('catalog:open-source', url),
  list: () => ipcRenderer.invoke('projects:list'),
  get: (id) => ipcRenderer.invoke('projects:get', id),
  create: (input) => ipcRenderer.invoke('projects:create', input),
  getBaseline: (projectId) => ipcRenderer.invoke('projects:get-baseline', projectId),
  importDeck: (input) => ipcRenderer.invoke('projects:import-deck', input),
  getReconciliation: (projectId) => ipcRenderer.invoke('deck:get-reconciliation', projectId),
  saveLineMapping: (input) => ipcRenderer.invoke('deck:save-line-mapping', input),
  clearLineMapping: (input) => ipcRenderer.invoke('deck:clear-line-mapping', input),
  getMeta: () => ipcRenderer.invoke('matchups:get-meta'),
  listMatchupReports: (projectId, metaId) => ipcRenderer.invoke('matchups:list-reports', projectId, metaId),
  generateMatchup: (projectId, metaId, opponentId, override) => ipcRenderer.invoke('matchups:generate', projectId, metaId, opponentId, override),
  listMatchupDiscussions: (projectId, opponentId) => ipcRenderer.invoke('matchups:list-discussions', projectId, opponentId),
  listHistoricalMatchupOpponents: (projectId) => ipcRenderer.invoke('matchups:list-historical-opponents', projectId),
  reviseMatchup: (discussionId, feedback, override) => ipcRenderer.invoke('matchups:revise', discussionId, feedback, override),
  retryMatchupTurn: (discussionId, turnId, override) => ipcRenderer.invoke('matchups:retry-turn', discussionId, turnId, override),
  continueMatchup: (discussionId, metaId, override) => ipcRenderer.invoke('matchups:continue', discussionId, metaId, override),
  openLimitless: (url) => ipcRenderer.invoke('matchups:open-source', url),
  getAiPreferences: () => ipcRenderer.invoke('ai:get-preferences'),
  saveAiPreferences: (value) => ipcRenderer.invoke('ai:save-preferences', value),
  getAiConnection: () => ipcRenderer.invoke('ai:get-connection'),
  startAiLogin: () => ipcRenderer.invoke('ai:start-login'),
  logoutAi: () => ipcRenderer.invoke('ai:logout'),
  testAiConnection: () => ipcRenderer.invoke('ai:test')
}

contextBridge.exposeInMainWorld('projectsApi', api)
