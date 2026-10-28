/** Inspect the real Node worker in a Playwright-launched development process.
 * Test fixtures stay outside the production IPC and application bundles. */
export async function evaluateBackend(application, callback, argument) {
  return application.evaluate(async (_electron, { source, argument }) => {
    const { Session } = process.getBuiltinModule('node:inspector')
    const session = new Session()
    session.connect()
    let timer
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Backend inspector did not reply')), 10000)
        session.on('NodeWorker.attachedToWorker', ({ params }) => {
          if (!params.workerInfo.url.endsWith('/backend-worker.js')) return
          const message = JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
            expression: `(${source})(undefined, ${JSON.stringify(argument) ?? 'undefined'})`,
            returnByValue: true, awaitPromise: true
          } })
          session.post('NodeWorker.sendMessageToWorker', { sessionId: params.sessionId, message },
            error => { if (error) reject(error) })
        })
        session.on('NodeWorker.receivedMessageFromWorker', ({ params }) => {
          const reply = JSON.parse(params.message)
          if (reply.id !== 1) return
          if (reply.error || reply.result?.exceptionDetails)
            reject(new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails)))
          else resolve(reply.result?.result?.value)
        })
        session.post('NodeWorker.enable', { waitForDebuggerOnStart: false }, error => { if (error) reject(error) })
      })
    } finally { clearTimeout(timer); session.disconnect() }
  }, { source: callback.toString(), argument })
}
