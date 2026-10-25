import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { CodexSetupStatus } from '../shared/ai'

// Version checked against the official Codex changelog on 25 October 2026.
export const CODEX_PACKAGE = '@openai/codex@0.164.0'

export interface CodexLauncher { command: string; prefix: string[] }

export function localCodexScript(dataDir: string): string {
  return join(dataDir, 'codex-cli', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
}

export function codexLauncher(dataDir: string, env: NodeJS.ProcessEnv = process.env,
  platform = process.platform): CodexLauncher {
  if (env.POKEGURU_CODEX_BIN) return { command: env.POKEGURU_CODEX_BIN, prefix: [] }
  const local = localCodexScript(dataDir)
  if (existsSync(local)) return { command: 'node', prefix: [local] }
  if (platform === 'win32') {
    for (const directory of (env.PATH ?? env.Path ?? '').split(';')) {
      if (!directory) continue
      const native = join(directory, 'codex.exe')
      if (existsSync(native)) return { command: native, prefix: [] }
      const npmScript = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
      if (existsSync(npmScript)) return { command: 'node', prefix: [npmScript] }
    }
  }
  return { command: 'codex', prefix: [] }
}

function run(command: string, args: string[], options: { cwd?: string; timeout?: number; shell?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true, shell: options.shell ?? false,
      stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, options.timeout ?? 10_000)
    child.stdout.on('data', (chunk: Buffer) => { output = (output + chunk.toString()).slice(-4000) })
    child.stderr.on('data', (chunk: Buffer) => { errorOutput = (errorOutput + chunk.toString()).slice(-4000) })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) reject(new Error('L’operazione ha superato il tempo massimo.'))
      else if (code === 0) resolve(output.trim())
      else reject(new Error(errorOutput.trim() || `Comando terminato con codice ${code}.`))
    })
  })
}

export class CodexSetup {
  private installing: Promise<CodexSetupStatus> | null = null
  constructor(private readonly dataDir: () => string, private readonly runCommand = run) {}

  async status(): Promise<CodexSetupStatus> {
    const launcher = codexLauncher(this.dataDir())
    try {
      const version = await this.runCommand(launcher.command, [...launcher.prefix, '--version'])
      if (!/^codex-cli\s+\d+\.\d+\.\d+/i.test(version)) throw new Error('Versione Codex non riconosciuta.')
      return { cliAvailable: true, version, nodeAvailable: true, npmAvailable: true }
    } catch {
      const [node, npm] = await Promise.all([
        this.runCommand('node', ['--version']).then(() => true, () => false),
        this.runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'],
          { shell: process.platform === 'win32' }).then(() => true, () => false)
      ])
      return { cliAvailable: false, version: null, nodeAvailable: node, npmAvailable: npm }
    }
  }

  install(): Promise<CodexSetupStatus> {
    if (this.installing) return this.installing
    this.installing = this.installOnce().finally(() => { this.installing = null })
    return this.installing
  }

  private async installOnce(): Promise<CodexSetupStatus> {
    const before = await this.status()
    if (before.cliAvailable) return before
    if (!before.nodeAvailable || !before.npmAvailable) {
      throw new Error('Per installare Codex serve Node.js con npm. Installa Node.js LTS e riprova.')
    }
    const directory = join(this.dataDir(), 'codex-cli')
    mkdirSync(directory, { recursive: true })
    // Only fixed arguments reach the Windows command shell. cwd carries the profile path.
    await this.runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', '.', CODEX_PACKAGE],
      { cwd: directory, timeout: 300_000, shell: process.platform === 'win32' })
    const after = await this.status()
    if (!after.cliAvailable) throw new Error('Installazione terminata, ma la CLI Codex non si avvia.')
    return after
  }
}
