import { defineConfig } from "@farmfe/core";

export default defineConfig({
  compilation: {
    // presetEnv: false,
    persistentCache: false,
    progress: false,
  },
  plugins: ["@farmfe/plugin-react"],
});
