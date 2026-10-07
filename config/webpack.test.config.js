"use strict";

const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const paths = require("./paths");
const modules = require("./modules");

// Reuse the main config's module resolution and loaders, but strip everything
// else down. This builds test harness files that run inside a real browser.
module.exports = {
  mode: "development",
  target: ["web"],
  devtool: "cheap-module-source-map",
  entry: path.resolve(
    paths.appSrc,
    "entities/__tests__/allEntities.harness.ts"
  ),
  output: {
    path: path.resolve(paths.appPath, "build/test"),
    filename: "harness.js",
    publicPath: "/"
  },
  resolve: {
    modules: ["node_modules", paths.appNodeModules].concat(
      modules.additionalModulePaths || []
    ),
    extensions: paths.moduleFileExtensions.map((ext) => `.${ext}`),
    alias: {
      "react-native": "react-native-web",
      ...(modules.webpackAliases || {})
    },
    fallback: {
      assert: require.resolve("assert/"),
      buffer: require.resolve("buffer/"),
      path: require.resolve("path-browserify"),
      module: false,
      dgram: false,
      dns: false,
      fs: false,
      http2: false,
      net: false,
      tls: false,
      child_process: false,
      vm: false
    },
    symlinks: false
  },
  module: {
    strictExportPresence: true,
    rules: [
      {
        oneOf: [
          // Images
          {
            test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/, /\.ttf$/],
            type: "asset",
            parser: { dataUrlCondition: { maxSize: 10000 } },
            exclude: [/\/spine\/.+\//]
          },
          // SVG
          {
            test: /\.svg$/,
            use: [
              {
                loader: require.resolve("@svgr/webpack"),
                options: {
                  prettier: false,
                  svgo: false,
                  svgoConfig: { plugins: [{ removeViewBox: false }] },
                  titleProp: true,
                  ref: true
                }
              },
              {
                loader: require.resolve("file-loader"),
                options: { name: "static/media/[name].[hash].[ext]" }
              }
            ],
            issuer: { and: [/\.(ts|tsx|js|jsx|md|mdx)$/] }
          },
          // Raw JS files
          { test: /\.raw\.js$/, type: "asset/source" },
          // Shaders and text
          { test: /\.(txt|md|glsl|frag|vert)$/, type: "asset/source" },
          // Tiled JSON
          { test: /\.(tsj|tmj)$/, loader: require.resolve("json-loader") },
          // 3D models
          { test: /\.(glb)$/, loader: require.resolve("file-loader") },
          { test: /\.(gltf)$/, loader: require.resolve("file-loader") },
          { test: /\.(fbx)$/, loader: require.resolve("file-loader") },
          // Protosprite
          { test: /\.(prs)$/, loader: require.resolve("file-loader") },
          // Audio
          { test: /\.(mp3|wav)$/, loader: require.resolve("file-loader") },
          // Spine atlases
          {
            test: [/\.atlas$/],
            type: "asset/resource",
            mimetype: "application/text"
          },
          // Application JS/TS with Babel
          {
            test: /\.(js|mjs|jsx|ts|tsx)$/,
            include: paths.appSrc,
            loader: require.resolve("babel-loader"),
            options: {
              customize: require.resolve(
                "babel-preset-react-app/webpack-overrides"
              ),
              presets: [
                [
                  require.resolve("babel-preset-react-app"),
                  { runtime: "automatic" }
                ]
              ],
              plugins: [],
              cacheDirectory: true,
              cacheCompression: false,
              compact: false
            }
          },
          // Node modules JS
          {
            test: /\.(js|mjs)$/,
            exclude: /@babel(?:\/|\\{1,2})runtime/,
            loader: require.resolve("babel-loader"),
            options: {
              babelrc: false,
              configFile: false,
              compact: false,
              presets: [
                [
                  require.resolve("babel-preset-react-app/dependencies"),
                  { helpers: true }
                ]
              ],
              cacheDirectory: true,
              cacheCompression: false
            }
          },
          // CSS (just inject into page via style-loader)
          {
            test: /\.css$/,
            use: [
              require.resolve("style-loader"),
              {
                loader: require.resolve("css-loader"),
                options: { importLoaders: 1, modules: { mode: "icss" } }
              }
            ],
            sideEffects: true
          },
          // LESS
          {
            test: /\.(less)$/,
            use: [
              require.resolve("style-loader"),
              {
                loader: require.resolve("css-loader"),
                options: { importLoaders: 3 }
              },
              require.resolve("less-loader")
            ]
          },
          // Catch-all file loader
          {
            exclude: [
              /^$/,
              /\.(js|mjs|jsx|ts|tsx|tsj|tmj|glb|gltf|fbx)$/,
              /\.html$/,
              /\.json$/
            ],
            type: "asset/resource"
          }
        ]
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      THREE: "three",
      process: "process"
    }),
    new HtmlWebpackPlugin({
      inject: true,
      template: path.resolve(
        paths.appSrc,
        "entities/__tests__/allEntities.harness.html"
      )
    }),
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify("development"),
      "process.env.PUBLIC_URL": JSON.stringify("")
    })
  ],
  // Increase timeout for WASM
  performance: { hints: false }
};
