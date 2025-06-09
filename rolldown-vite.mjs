import path from 'node:path';
import { defineConfig } from 'rolldown-vite';
import react from '@vitejs/plugin-react-oxc';

export default defineConfig({
  plugins: [react()],
  experimental: {
    enableNativePlugin: 'resolver',
  }
});
