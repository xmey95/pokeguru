import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CodexSetupStatus } from '../shared/ai'

// The official native package is copied into each desktop release.
export const CODEX_PACKAGE = '@openai/codex@0.164.0'

export interface CodexLauncher {
  command: string
  prefix: string[]
  source: 'included' | 'local' | 'external' | 'override'
}

function nativeTarget(platform: NodeJS.Platform, arch: string): { packageName: string; triple: string; binary: string } | null {
  if (platform === 'win32' && arch === 'x64') {
    return { packageName: 'codex-win32-x64', triple: 'x86_64-pc-windows-msvc', binary: 'codex.exe' }
  }
  if (platform === 'linux' && arch === 'x64') {
    return { packageName: 'codex-linux-x64', triple: 'x86_64-unknown-linux-musl', binary: 'codex' }
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { packageName: 'codex-darwin-x64', triple: 'x86_64-apple-darwin', binary: 'codex' }
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return { packageName: 'codex-darwin-arm64', triple: 'aarch64-apple-darwin', binary: 'codex' }
  }
  return null
}

export function codexLauncher(dataDir: string, env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform, arch = process.arch,
  resourcesDir = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? '',
  projectDir = process.cwd()): CodexLauncher {
  if (env.POKEGURU_CODEX_BIN) return { command: env.POKEGURU_CODEX_BIN, prefix: [], source: 'override' }

  const target = nativeTarget(platform, arch)
  if (target) {
    const included = resourcesDir && join(resourcesDir, 'codex', 'bin', target.binary)
    if (included && existsSync(included)) return { command: included, prefix: [], source: 'included' }

    // In development, npm ci supplies the same official native package.
    const packaged = Boolean(resourcesDir && existsSync(join(resourcesDir, 'app.asar')))
    if (!packaged) {
      const development = join(projectDir, 'node_modules', '@openai', target.packageName,
        'vendor', target.triple, 'bin', target.binary)
      if (existsSync(development)) return { command: development, prefix: [], source: 'included' }
    }

    const local = join(dataDir, 'codex-cli', 'node_modules', '@openai', target.packageName,
      'vendor', target.triple, 'bin', target.binary)
    if (existsSync(local)) return { command: local, prefix: [], source: 'local' }
  }

  if (platform === 'win32') {
    for (const directory of (env.PATH ?? env.Path ?? '').split(';')) {
      if (!directory) continue
      const binary = join(directory, 'codex.exe')
      if (existsSync(binary)) return { command: binary, prefix: [], source: 'external' }
    }
  }
  return { command: 'codex', prefix: [], source: 'external' }
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 10_000)
    child.stdout.on('data', (chunk: Buffer) => { output = (output + chunk.toString()).slice(-4000) })
    child.stderr.on('data', (chunk: Buffer) => { errorOutput = (errorOutput + chunk.toString()).slice(-4000) })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) reject(new Error('La verifica di Codex ha superato il tempo massimo.'))
      else if (code === 0) resolve(output.trim())
      else reject(new Error(errorOutput.trim() || 'Codex terminato con codice ' + code + '.'))
    })
  })
}

export class CodexSetup {
  constructor(private readonly dataDir: () => string, private readonly runCommand = run) {}

  async status(): Promise<CodexSetupStatus> {
    const launcher = codexLauncher(this.dataDir())
    try {
      const version = await this.runCommand(launcher.command, [...launcher.prefix, '--version'])
      if (!/^codex-cli\s+\d+\.\d+\.\d+/i.test(version)) throw new Error('Versione Codex non riconosciuta.')
      return { cliAvailable: true, version, bundled: launcher.source === 'included' }
    } catch {
      return { cliAvailable: false, version: null, bundled: false }
    }
  }
}
