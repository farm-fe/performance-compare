import { defineConfig } from "@farmfe/core";

export default defineConfig({
  plugins: ["@farmfe/plugin-react"],
  compilation: {
    sourcemap: process.env.NODE_ENV === "development" ? true : false,
  },
});
