import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// every build gets its own id; the app compares it with /version.json to know when a newer version is live
const BUILD_ID = String(Date.now())
const versionFile = () => ({
  name: 'chatzy-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
