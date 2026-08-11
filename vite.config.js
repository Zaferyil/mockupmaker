import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // pose-detection bundles a BlazePose/MediaPipe runtime we never use, and
      // @mediapipe/pose ships UMD with no real ESM exports, so the bundler
      // cannot resolve `Pose` from it. We run MoveNet only — see
      // src/placement/poseLandmarks.js — so the import is dead code.
      '@mediapipe/pose': fileURLToPath(
        new URL('./src/stubs/mediapipe-pose.js', import.meta.url),
      ),
    },
  },
})
