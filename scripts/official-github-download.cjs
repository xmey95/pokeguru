const { spawn } = require('node:child_process')
const path = require('node:path')

const repositories = new Set(['electron/electron', 'electron-userland/electron-builder-binaries'])
function parseGitHubAsset(value) {
  const url = new URL(value)
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const repository = parts.slice(0, 2).join('/')
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password ||
    url.port || url.search || url.hash || parts.length !== 6 || parts[2] !== 'releases' ||
    parts[3] !== 'download' || !repositories.has(repository) ||
    !/^[\w@.+-]+$/.test(parts[4]) || !/^[\w@.+-]+$/.test(parts[5]) ||
    parts[4].includes('..') || parts[5].includes('..')) throw new Error('Unapproved GitHub artifact URL.')
  return { repository, tag: parts[4], filename: parts[5] }
}
const officialGitHubDownloader = {
  async download(url, target) {
    const asset = parseGitHubAsset(url)
    if (path.basename(target) !== asset.filename) throw new Error('Artifact filename mismatch.')
    console.log('Official GitHub API asset: ' + asset.repository + ' ' + asset.tag + '/' + asset.filename)
    await new Promise((resolve, reject) => {
      const child = spawn('gh', ['release', 'download', asset.tag, '--repo', asset.repository,
        '--pattern', asset.filename, '--output', target], { stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true, timeout: 300000 })
      child.once('error', reject)
      child.once('exit', (code, signal) => code === 0 ? resolve() :
        reject(new Error('Official GitHub asset download failed: ' + (signal || code))))
    })
  }
}
function wrapDownloadArtifact(original, downloader = officialGitHubDownloader) {
  return function downloadArtifact(options) {
    if (options.unsafelyDisableChecksums === true) throw new Error('Unchecked build artifacts are not allowed in CI.')
    if (options.downloader && options.downloader !== downloader) throw new Error('Conflicting CI artifact downloader.')
    // Only transport changes. SDK checksum validation, cache identity, extraction
    // and callers' complete options remain active and unmodified.
    return original({ ...options, downloader })
  }
}
module.exports = { parseGitHubAsset, officialGitHubDownloader, wrapDownloadArtifact }
