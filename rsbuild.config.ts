import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [pluginReact()],
  server: {
    port: 6532
  },
  output: {
    sourceMap: isProduction ? false : {
      js: 'inline-source-map',
      css: false,
    },
  }
});
