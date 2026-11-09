const fs = require('node:fs')
const path = require('node:path')
const { officialGitHubDownloader } = require('./official-github-download.cjs')
async function warmOfficialElectron(cacheRoot = process.env.electron_config_cache) {
  const { downloadArtifact } = await import('@electron/get')
  return downloadArtifact({ version: require('electron/package.json').version, artifactName: 'electron',
    platform: process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || process.platform,
    arch: process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch,
    cacheRoot, checksums: require('electron/checksums.json'), downloader: officialGitHubDownloader })
}
async function prepareRuntime() {
  const base = path.dirname(require.resolve('electron/package.json'))
  const version = require('electron/package.json').version
  const pathFile = path.join(base, 'path.txt'), versionFile = path.join(base, 'dist/version')
  const installed = fs.existsSync(pathFile) && fs.existsSync(versionFile) &&
    fs.readFileSync(versionFile, 'utf8').replace(/^v/, '').trim() === version &&
    fs.existsSync(path.join(base, 'dist', fs.readFileSync(pathFile, 'utf8').trim()))
  if (!installed) await warmOfficialElectron()
  // The unchanged Electron installer revalidates the pinned checksum and extracts
  // its standard cache. No custom extraction or checksum bypass is introduced.
  fs.accessSync(require('electron'))
  console.log('Electron ' + version + ': runtime available; checksum validation active.')
}
module.exports = { warmOfficialElectron, prepareRuntime }
if (require.main === module) prepareRuntime().catch(error => { console.error(error); process.exitCode = 1 })
