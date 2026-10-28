import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { BackendClient } from '../src/main/backend-rpc'

it('routes concurrent replies and desktop actions, and rejects outstanding requests when the worker exits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-worker-rpc-')), path = join(directory, 'worker.cjs')
  writeFileSync(path, `const { parentPort: port } = require('node:worker_threads');
    port.on('message', message => {
      if (message.type === 'host-reply') port.postMessage({ type: 'reply', id: message.id, value: message.value });
      else if (message.channel === 'host') port.postMessage({ type: 'host', id: message.id, action: 'copy-text', value: message.args[0] });
      else if (message.channel === 'echo') setTimeout(() => port.postMessage({ type: 'reply', id: message.id, value: message.args[0] }), message.args[1]);
      else if (message.channel === 'crash') process.exit(7);
    });
    port.postMessage({ type: 'ready', channels: ['echo', 'host', 'hang', 'crash'] });`)
  const host = vi.fn(async (_action, value) => ({ copied: value }))
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const client = new BackendClient(path, { userData: directory, temp: directory, downloads: directory,
    version: 'test', packaged: false, electron: 'test', chrome: 'test' }, host)
  try {
    await client.ready
    expect(await Promise.all([client.invoke('echo', ['slow', 25]), client.invoke('echo', ['fast', 0]),
      client.invoke('host', ['text'])])).toEqual(['slow', 'fast', { copied: 'text' }])
    expect(host).toHaveBeenCalledWith('copy-text', 'text')
    const pending = expect(client.invoke('hang')).rejects.toThrow('Riapri Pokéguru')
    await expect(client.invoke('crash')).rejects.toThrow('Riapri Pokéguru')
    await pending
    await expect(client.invoke('echo', ['after exit'])).rejects.toThrow('Riapri Pokéguru')
  } finally { await client.stop(); errors.mockRestore(); rmSync(directory, { recursive: true, force: true }) }
})
