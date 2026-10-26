import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const files = new Map([['/', 'index.html'], ['/index.html', 'index.html'],
  ['/main.js', 'main.js'], ['/styles.css', 'styles.css'], ['/layout.css', 'layout.css']])
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8' }

createServer(async (request, response) => {
  const name = files.get(new URL(request.url, 'http://127.0.0.1').pathname)
  if (!name) { response.writeHead(404); response.end('Not found'); return }
  try {
    const body = await readFile(join(import.meta.dirname, name))
    response.writeHead(200, { 'Content-Type': types[name.slice(name.lastIndexOf('.'))] })
    response.end(body)
  } catch { response.writeHead(500); response.end('File unavailable') }
}).listen(4173, '127.0.0.1', () => console.log('Pokéguru prototype: http://127.0.0.1:4173'))
