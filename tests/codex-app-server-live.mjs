import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const workdir = mkdtempSync(join(tmpdir(), 'pokeguru-codex-probe-'))
const command = process.env.POKEGURU_CODEX_BIN || 'codex'
const timeoutMs = 120_000

function connect() {
  const child = spawn(command, ['app-server', '--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  })
  child.stderr.resume()
  let nextId = 0
  const pending = new Map()
  const events = new Set()
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    let message
    try { message = JSON.parse(line) } catch { return }
    if (typeof message.id === 'number') {
      const entry = pending.get(message.id)
      if (!entry) return
      clearTimeout(entry.timer)
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message || 'RPC error'))
      else entry.resolve(message.result)
      return
    }
    for (const listener of events) listener(message)
  })
  function request(method, params = {}) {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ method, id, params })}\n`)
    })
  }
  async function initialize() {
    await request('initialize', { clientInfo: { name: 'pokeguru', title: 'Pokéguru', version: '0.1.0' } })
    child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
  }
  async function turn(threadId, input, model) {
    let turnId
    const completed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { events.delete(listener); reject(new Error('turn/completed timed out')) }, timeoutMs)
      const listener = (event) => {
        if (event.method !== 'turn/completed' || event.params?.threadId !== threadId) return
        if (turnId && event.params?.turn?.id !== turnId) return
        clearTimeout(timer)
        events.delete(listener)
        resolve(event.params?.turn)
      }
      events.add(listener)
    })
    const response = await request('turn/start', {
      threadId,
      input: [{ type: 'text', text: input }],
      cwd: workdir,
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'readOnly' },
      ...(model ? { model } : {}),
      outputSchema: {
        type: 'object', properties: { answer: { type: 'string' } },
        required: ['answer'], additionalProperties: false
      }
    })
    turnId = response?.turn?.id
    if (!turnId) throw new Error('turn/start returned no turn ID')
    return completed
  }
  async function close() {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Connection closed')) }
    pending.clear()
    const exited = new Promise((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once('close', resolve)
    })
    child.kill()
    lines.close()
    await exited
  }
  return { request, initialize, turn, close }
}

let first
let second
function assertAnswer(turn, expected) {
  if (turn?.status !== 'completed') throw new Error('Turn did not complete')
  const message = turn.items?.find((item) => item.type === 'agentMessage' && item.phase !== 'commentary')
  if (!message || typeof message.text !== 'string') throw new Error('Missing structured answer')
  const value = JSON.parse(message.text)
  if (Object.keys(value).length !== 1 || typeof value.answer !== 'string' || !value.answer.includes(expected)) {
    throw new Error(`Structured answer does not match the local schema: ${JSON.stringify(value)}`)
  }
}
try {
  first = connect()
  await first.initialize()
  const account = await first.request('account/read', { refreshToken: false })
  const models = await first.request('model/list', { limit: 100, includeHidden: false })
  const selectedModel = models?.data?.find((entry) => entry.isDefault)?.model ?? models?.data?.[0]?.model
  console.log(JSON.stringify({ phase: 'access', account: account?.account?.type ?? 'none', modelCount: models?.data?.length ?? 0, selectedModel }))
  if (!account?.account || !selectedModel) throw new Error('Codex account or models unavailable')
  const started = await first.request('thread/start', {
    model: selectedModel, cwd: workdir, approvalPolicy: 'never', sandbox: 'read-only', serviceName: 'pokeguru'
  })
  const threadId = started?.thread?.id
  if (!threadId) throw new Error('thread/start returned no thread ID')
  const one = await first.turn(threadId, 'Rispondi in JSON con answer uguale a: dato ricevuto: 60 carte, circuito occidentale.', selectedModel)
  console.log(JSON.stringify({ phase: 'first-turn', status: one?.status, items: one?.items?.map((item) => item.type) }))
  assertAnswer(one, 'dato ricevuto: 60 carte, circuito occidentale')
  await first.close()
  first = null

  second = connect()
  await second.initialize()
  const resumed = await second.request('thread/resume', { threadId, excludeTurns: true })
  if (resumed?.thread?.id !== threadId) throw new Error('thread/resume returned a different thread')
  const two = await second.turn(threadId, 'Continua questa conversazione e rispondi in JSON con answer uguale a: ripresa riuscita.', selectedModel)
  console.log(JSON.stringify({ phase: 'resumed-turn', status: two?.status, items: two?.items?.map((item) => item.type) }))
  assertAnswer(two, 'ripresa riuscita')
  console.log('APP-004 live App Server probe passed')
} catch (error) {
  console.error(`APP-004 live App Server probe failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await first?.close()
  await second?.close()
  rmSync(workdir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
