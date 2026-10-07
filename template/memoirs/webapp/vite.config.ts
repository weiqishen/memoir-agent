import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webappDir = path.dirname(fileURLToPath(import.meta.url))
const memoirsDir = path.resolve(webappDir, '..')
const cacheManifest = path.join(memoirsDir, '.cache', 'memoirs.manifest.json')
const periodsDir = path.join(memoirsDir, 'periods')

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

/**
 * Dev-only routes mirroring open_memoirs.pyw in production:
 *   /memoirs.manifest.json -> memoirs/.cache/memoirs.manifest.json
 *   /media/<period>/<file> -> memoirs/periods/<period>/assets/<file>
 * No data is copied; run `memoir build` first.
 */
function memoirDataRoutes() {
  return {
    name: 'memoir-data-routes',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use((req: { url?: string }, res: any, next: () => void) => {
        const url = (req.url || '').split('?')[0]

        if (url === '/memoirs.manifest.json') {
          fs.readFile(cacheManifest, (error, data) => {
            if (error) {
              res.statusCode = 404
              res.end('memoirs.manifest.json not built yet — run `memoir build` first.')
              return
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(data)
          })
          return
        }

        if (url.startsWith('/media/')) {
          const parts = decodeURIComponent(url.slice('/media/'.length)).split('/')
          const invalid = parts.length !== 2
            || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\'))
          if (invalid) {
            res.statusCode = 404
            res.end()
            return
          }
          const [period, filename] = parts
          const assetsRoot = path.resolve(periodsDir, period, 'assets')
          const filePath = path.resolve(assetsRoot, filename)
          if (!filePath.startsWith(assetsRoot + path.sep)) {
            res.statusCode = 404
            res.end()
            return
          }
          fs.readFile(filePath, (error, data) => {
            if (error) {
              res.statusCode = 404
              res.end()
              return
            }
            res.setHeader('Content-Type', MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream')
            res.end(data)
          })
          return
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), memoirDataRoutes()],
})
