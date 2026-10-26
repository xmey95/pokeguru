// UI fixture only: no real Codex account, browser login or generation.
// Preference reads use the app's store; explicit-model writes are controlled.
// Automatico saves still pass through the production IPC handler.
export async function installAiFixture(application) {
  await application.evaluate(async ({ ipcMain, app }) => {
    const fs = process.getBuiltinModule('node:fs')
    const path = process.getBuiltinModule('node:path')
    const preferencesPath = path.join(app.getPath('userData'), 'ai-preferences.json')
    const originalSave = ipcMain._invokeHandlers.get('ai:save-preferences')
    const originalRead = ipcMain._invokeHandlers.get('ai:get-preferences')
    const models = [
      { id: 'demo-a', name: 'Modello demo A', isDefault: true, defaultReasoningEffort: 'medium',
        reasoningEfforts: [{ id: 'low', description: 'Ragionamento ridotto · esempio UI.' }, { id: 'medium', description: 'Ragionamento medio · esempio UI.' }, { id: 'high', description: 'Ragionamento approfondito · esempio UI.' }] },
      { id: 'demo-b', name: 'Modello demo B', isDefault: false, defaultReasoningEffort: 'high',
        reasoningEfforts: [{ id: 'high', description: 'Livello disponibile nella fixture.' }] }
    ]
    globalThis.aiUi = { connection: { account: 'chatgpt', plan: 'Demo UI', models }, connectionError: null,
      saveError: null, testError: null, loginError: null, hold: null, release: null, calls: [] }
    const replace = (name, handler) => { ipcMain.removeHandler(name); ipcMain.handle(name, handler) }
    replace('ai:get-connection', () => globalThis.aiUi.connectionError
      ? { ok: false, error: globalThis.aiUi.connectionError } : { ok: true, value: globalThis.aiUi.connection })
    replace('ai:save-preferences', async (event, value) => {
      const state = globalThis.aiUi
      state.calls.push(['save', value])
      if (state.hold === 'save') await new Promise(resolve => { state.release = resolve })
      if (state.saveError) return { ok: false, error: state.saveError }
      if (value.model === null) return originalSave(event, value)
      fs.writeFileSync(preferencesPath, JSON.stringify(value))
      return { ok: true, value }
    })
    replace('ai:test', async (event) => {
      const state = globalThis.aiUi
      state.calls.push(['test', originalRead(event).value])
      if (state.hold === 'test') await new Promise(resolve => { state.release = resolve })
      return state.testError ? { ok: false, error: state.testError } : { ok: true, value: true }
    })
    replace('ai:start-login', (event, mode) => {
      globalThis.aiUi.calls.push(['login', mode])
      return globalThis.aiUi.loginError ? { ok: false, error: globalThis.aiUi.loginError }
        : { ok: true, value: mode === 'device'
          ? { mode: 'device', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-1234' }
          : { mode: 'browser' } }
    })
    replace('ai:login-progress', () => ({ ok: true, value: { state: 'pending', error: null } }))
    replace('ai:cancel-login', () => ({ ok: true, value: true }))
    replace('ai:logout', () => {
      globalThis.aiUi.calls.push(['logout'])
      globalThis.aiUi.connection.account = null
      return { ok: true, value: true }
    })
  })
}
