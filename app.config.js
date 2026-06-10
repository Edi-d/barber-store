// Dynamic Expo config. Wraps the static app.json so build-time secrets (the
// Mapbox SDK download token) come from the environment instead of being
// committed. Everything else still lives in app.json.
module.exports = ({ config }) => {
  // `config` is the static config already loaded from app.json.
  const plugins = (config.plugins ?? []).map((plugin) =>
    plugin === "@rnmapbox/maps"
      ? [
          "@rnmapbox/maps",
          {
            // Secret token (sk....) with the DOWNLOADS:READ scope. Required to
            // download the native Mapbox SDK at build time only — never shipped.
            RNMapboxMapsDownloadToken: process.env.RNMAPBOX_DOWNLOAD_TOKEN,
          },
        ]
      : plugin
  );

  return { ...config, plugins };
};
