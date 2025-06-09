import { defineConfig } from "@farmfe/core";

const isProduction = process.env.NODE_ENV === 'production';

console.log(isProduction);

export default defineConfig({
  plugins: ["@farmfe/plugin-react"],
  compilation: {
    sourcemap: isProduction ? false : 'inline',
    presetEnv: false,
  },
});
