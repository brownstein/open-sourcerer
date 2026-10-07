"use strict";

process.env.NODE_ENV = "development";
process.env.BABEL_ENV = "development";

const webpack = require("webpack");
const config = require("../config/webpack.test.config.js");

const compiler = webpack(config);
compiler.run((err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(
    stats.toString({ colors: true, modules: false, chunks: false })
  );
  compiler.close(() => {});
  if (stats.hasErrors()) process.exit(1);
});
