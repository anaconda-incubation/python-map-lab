import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  worker: {
    // ES-module workers so the Pyodide worker can dynamically import the
    // pinned CDN build (pyodide.mjs) in both dev and production bundles.
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy vendor libs out of the main bundle so first paint
        // isn't gated on Three.js / CodeMirror / KaTeX parsing.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('/three/')) return 'vendor-three'
          if (id.includes('/@codemirror/') || id.includes('/@lezer/')) return 'vendor-codemirror'
          if (id.includes('/katex/')) return 'vendor-katex'
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
