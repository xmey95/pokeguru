import { accessSync, constants, cpSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

if (process.platform !== 'darwin' || !['x64', 'arm64'].includes(process.arch)) {
  throw new Error('Il pacchetto macOS richiede un runner macOS Intel o Apple Silicon.')
}

const triple = process.arch === 'x64' ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin'
const source = resolve('node_modules', '@openai', `codex-darwin-${process.arch}`, 'vendor', triple)
const binary = join(source, 'bin', 'codex')
if (!existsSync(binary)) throw new Error(`Codex nativo ${process.arch} assente: ${binary}`)
accessSync(binary, constants.X_OK)

const target = resolve('build', 'mac-codex')
rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })
accessSync(join(target, 'bin', 'codex'), constants.X_OK)
console.log(`Codex ${process.arch} incluso in ${target}`)
