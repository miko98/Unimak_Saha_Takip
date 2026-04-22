import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react') || id.includes('react-router-dom')) return 'react'
          if (id.includes('recharts')) return 'charts'
          if (id.includes('/node_modules/jspdf/')) return 'jspdf'
          if (id.includes('/node_modules/jspdf-autotable/')) return 'jspdf-autotable'
          if (id.includes('/node_modules/xlsx/')) return 'xlsx'
          if (id.includes('/node_modules/html2canvas/')) return 'html2canvas'
          return 'vendor'
        },
      },
    },
  },
})
