import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  target: ['esnext', 'chrome100'],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  name: 'proton',
  sourcemap: true,
})