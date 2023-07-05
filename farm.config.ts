export default {
  compilation: {
    input: {
      index: "./index.html",
    },
    resolve: {
      symlinks: true,
      mainFields: ["module", "main", "customMain"],
    },
    output: {
      path: "./build",
    },
  },
  server: {
    hmr: true,
  },
  plugins: ["@farmfe/plugin-react"],
};
