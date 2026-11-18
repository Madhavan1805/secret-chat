import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Every build gets an id (the git commit on Vercel). It is baked into the app AND written to /version.json,
// so a phone that still runs an older copy can notice a newer one is live and ask the user to update (UpdateGate.jsx).
// Put the "what's new" bullets (one per line) in whats-new.txt before each release; they show in that popup.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())).slice(0, 12)

const versionFile = () => ({
  name: 'chatzy-version-file',
  generateBundle() {
    let notes = []
    try { notes = fs.readFileSync(new URL('./whats-new.txt', import.meta.url), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) } catch (e) { /* no notes */ }
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD_ID, notes }) })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
