import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/test-setup.ts',
        'src/types/index.ts',
        'src/i18n/config.ts',
        'src/i18n/index.ts',
        '**/*.json',
      ],
      thresholds: { lines: 95, functions: 90, branches: 85, statements: 94 }
    }
  }
})
