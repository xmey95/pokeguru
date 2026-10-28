import { parentPort } from 'node:worker_threads'
import { initializeBackend, shutdownBackend, backendHandlers, recordRuntimeIncident } from './backend'
import { resolveHostReply } from './backend-host'

const port = parentPort!
let shuttingDown = false
async function start() {
  await initializeBackend()
  port.on('message', async (message) => {
    if (message.type === 'host-reply') { resolveHostReply(message); return }
    if (message.type !== 'invoke') return
    try {
      if (shuttingDown) throw new Error('Chiusura di Pokéguru in corso.')
      let value: unknown
      if (message.channel === '$shutdown') {
        shuttingDown = true
        await shutdownBackend()
      } else if (message.channel === '$incident') recordRuntimeIncident(message.args[0])
      else {
        const handler = backendHandlers.get(message.channel)
        if (!handler) throw new Error('Operazione locale non disponibile.')
        value = await handler(...message.args)
      }
      port.postMessage({ type: 'reply', id: message.id, value })
    } catch (error) {
      port.postMessage({ type: 'reply', id: message.id,
        error: error instanceof Error ? error.message : 'Operazione locale non riuscita.' })
    }
  })
  port.postMessage({ type: 'ready', channels: [...backendHandlers.keys()] })
}
void start()
