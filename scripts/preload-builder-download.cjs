// Scoped to CI packaging processes via NODE_OPTIONS, never the shipped app.
const { createRequire } = require('node:module')
const { wrapDownloadArtifact } = require('./official-github-download.cjs')
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
const electronGet = builderRequire('@electron/get')
if (!Object.getOwnPropertyDescriptor(electronGet, 'downloadArtifact')?.writable) {
  throw new Error('Unsupported electron-builder download interface.')
}
electronGet.downloadArtifact = wrapDownloadArtifact(electronGet.downloadArtifact)
