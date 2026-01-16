module.exports = function override(config) {
  // Add fallbacks for Node.js core modules (needed for face-api.js)
  config.resolve.fallback = {
    ...config.resolve.fallback,
    fs: false,
    path: false,
    os: false
  };
  return config;
};
