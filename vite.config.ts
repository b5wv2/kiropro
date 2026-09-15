import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const envHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map(h => h.trim())
  .filter(Boolean);

// Explicitly trusted production hosts (Strict security: no broad wildcards)
const allowedHosts = [
  'kiropro.store',
  'www.kiropro.store',
  ...envHosts,
  ...(process.env.RAILWAY_PUBLIC_DOMAIN ? [process.env.RAILWAY_PUBLIC_DOMAIN] : []),
  ...(process.env.RAILWAY_STATIC_URL ? [process.env.RAILWAY_STATIC_URL] : [])
];

//j

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      ignored: ['**/*.zip', '**/server/**', '**/.git/**', '**/uploads/**']
    },
    proxy: {
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5173,
    host: '0.0.0.0',
    allowedHosts
  }
});
