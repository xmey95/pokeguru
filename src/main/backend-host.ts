import { parentPort, workerData } from 'node:worker_threads'
import type { BackendContext, HostAction, RpcReply } from './backend-rpc'

export const backendContext = workerData as BackendContext
let nextId = 0
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
export function callHost(action: HostAction, value: unknown): Promise<unknown> {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    parentPort!.postMessage({ type: 'host', id, action, value })
  })
}
export function resolveHostReply(reply: RpcReply): void {
  const request = pending.get(reply.id)
  pending.delete(reply.id)
  if (reply.error) request?.reject(new Error(reply.error))
  else request?.resolve(reply.value)
}
