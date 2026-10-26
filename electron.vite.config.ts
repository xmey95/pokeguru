import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export const developmentCsp = [
  "default-src 'none'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: pokeguru://cards",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:* ws://[::1]:*",
  "font-src 'self'", "object-src 'none'", "base-uri 'none'",
  "form-action 'none'", "frame-src 'none'"
].join('; ')

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    server: { headers: { 'Content-Security-Policy': developmentCsp } }
  }
})
