import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://<user>.github.io/LocalWeatherForecast/ on GitHub Pages.
export default defineConfig({
  base: '/LocalWeatherForecast/',
  plugins: [react()],
})
