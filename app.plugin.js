// Expo resolves `expo-xcasset-plugin` (in `app.json` `plugins`) to this file.
const plugin = require('./build');

module.exports = plugin.default ?? plugin;
