import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  // Tauri expects a relative base path
  base: './',
  
  // Build configuration for Tauri
  build: {
    // Tauri uses Chromium on Windows and WebKit on Linux/macOS
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  
  // Remove proxy - not needed with Tauri
  // server: {
  //   proxy: { ... } 
  // },
  
  // Prevent vite from obscuring rust errors
  clearScreen: false,
  
  // Tauri expects a fixed port
  server: {
    port: 5173,
    strictPort: true,
  },
  
  // Environment variables
  envPrefix: ['VITE_', 'TAURI_'],
})