import { defineConfig } from 'rolldown';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const caseName = process.env.CASE ?? 'medium';

export default defineConfig({
  input: {
    main: path.join(import.meta.dirname, './src', caseName, 'index.jsx'),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
  output: {
    minify: isProduction,
  },
});
