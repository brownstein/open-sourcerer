module.exports = {
  presets: [
    "@babel/preset-env",
    "@babel/preset-react",
    ["react-app", {
      typescript: true
    }] 
  ],
  plugins: [
    "@babel/transform-runtime",
    "babel-plugin-transform-import-meta"
  ],
};