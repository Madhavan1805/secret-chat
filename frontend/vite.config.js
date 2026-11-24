import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Every build gets an id (the git commit on Vercel). It is baked into the app AND written to /version.json,
// so a phone that still runs an older copy can notice a newer one is live and ask the user to update (UpdateGate.jsx).
// The details of each update live in src/changelog.js (Profile > What's new); the popup itself only says an update is ready.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())).slice(0, 12)

const versionFile = () => ({
  name: 'chatzy-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD_ID }) })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
