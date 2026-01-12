import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': '/Users/vrusi/workspace/time-tracker/src',
    },
  },
})
