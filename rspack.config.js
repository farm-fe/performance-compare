/**
 * @type {import('@rspack/cli').Configuration}
 */
module.exports = {
  context: __dirname,
  entry: {
    main: "./src/index.tsx",
  },
  builtins: {
    html: [
      {
        template: "./index.webpack.html",
      },
    ],
    // noEmitAssets: true,
    devFriendlySplitChunks: true,
  },
  watchOptions: {
    poll: 0,
    aggregateTimeout: 0,
  },
  stats: {
    timings: true,
    all: false,
  },
  module: {
    rules: [
      {
        test: /\.svg$/,
        type: "asset",
      },
    ],
  },
};
