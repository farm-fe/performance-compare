const HtmlWebpackPlugin = require("html-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");

// webpack.config.js
module.exports = {
  entry: "./src/index.tsx",
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".ts", ".tsx"],
  },
  cache: {
    type: "filesystem",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              "@babel/preset-react",
              "@babel/preset-typescript",
            ],
            plugins: [require("react-refresh/babel")],
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.jsx?$/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
            plugins: [require("react-refresh/babel")],
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.svg$/,
        type: "asset",
      },
    ],
  },
  devServer: {
    port: 8081,
    hot: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./index.webpack.html",
    }),
    new ReactRefreshWebpackPlugin(),
  ],
};
