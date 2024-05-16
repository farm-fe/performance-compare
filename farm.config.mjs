import { defineConfig } from "@farmfe/core";

export default defineConfig({
  compilation: {
    presetEnv: false,
    progress: false,
  },
  plugins: ["@farmfe/plugin-react"],
});
