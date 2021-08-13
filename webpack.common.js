const path = require("path");

module.exports = {
  entry: "./src/index.js",
  output: {
    filename: "bundled_index.js",
    path: path.join(__dirname, "./dist/")
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: ["babel-loader"]
      },
      {
        test: /\.css$/,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: { url: false }
          }
        ]
      }
    ]
  },
  watch: true
};
