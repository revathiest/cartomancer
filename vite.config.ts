import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this repo from https://<user>.github.io/cartomancer/,
  // not the domain root, so every asset URL needs this prefix.
  base: '/cartomancer/',
  plugins: [react()],
})
