import { defineConfig } from "@farmfe/core";

export default defineConfig({
  compilation: {
    presetEnv: false,
    // minify: {
    //   mode: "minify-resource-pot"
    // },
    // persistentCache: false,
    // partialBundling: {
    //   enforceResources: [
    //     {
    //       name: "index.js",
    //       test: [".+"],
    //     },
    //   ],
    // },
  },
  plugins: ["@farmfe/plugin-react"],
});
