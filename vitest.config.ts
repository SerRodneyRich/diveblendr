import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  // The primitive-library tests render real components, so JSX must compile
  // with React's automatic runtime. Pure calculation tests are unaffected.
  esbuild: { jsx: 'automatic' },
  test: {
    // Calculation modules are pure and framework-free, so the default node
    // environment is correct. Component tests, if ever added, should opt into
    // jsdom per-file with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/utils/**'],
      reporter: ['text', 'html'],
    },
  },
})
