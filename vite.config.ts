import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  build: {
    sourcemap: isProduction ? false : 'inline',
  },
  plugins: [
    react()
  ],
});
