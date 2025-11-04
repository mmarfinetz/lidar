import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glsl'],
  optimizeDeps: {
    exclude: ['laz-perf']
  },
  server: {
    proxy: {
      // Dev-time proxy to avoid CORS when hitting Open Context directly
      '/api/opencontext': {
        target: 'https://opencontext.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/opencontext/, '/subjects-search'),
      },
    },
  },
})
