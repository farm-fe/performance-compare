/**
 * @type {import('@rspack/cli').Configuration}
 */
module.exports = {
	context: __dirname,
	entry: {
		main: "./src/index.tsx"
	},
	builtins: {
		html: [
			{
				template: "./index.webpack.html"
			}
		]
	},
	module: {
		rules: [
			{
				test: /\.svg$/,
				type: "asset"
			}
		]
	},
};
