const fs = require('node:fs')
fs.accessSync(require('electron'))
console.log('Electron ' + require('electron/package.json').version + ': runtime available.')
