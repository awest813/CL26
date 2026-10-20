import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev and `npm run build` stay at /. `npm run build:pages` sets
// VITE_PAGES_BASE so the project site is served from /CL26/.
const pagesBase = process.env.VITE_PAGES_BASE || '/'

export default defineConfig({
  plugins: [react()],
  base: pagesBase,
})
