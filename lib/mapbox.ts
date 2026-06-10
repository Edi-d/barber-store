import Mapbox from "@rnmapbox/maps";

// Public access token (pk....) — used at runtime to render the map.
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

if (token) {
  Mapbox.setAccessToken(token);
} else if (__DEV__) {
  console.warn(
    "[mapbox] EXPO_PUBLIC_MAPBOX_TOKEN is not set — the map will render blank. " +
      "Add a public token to your .env (see .env.example)."
  );
}

// Custom Mapbox Studio style URL (mapbox://styles/<user>/<style-id>).
// Falls back to the standard light style so the map still renders before a
// branded style has been published.
export const MAPBOX_STYLE_URL =
  process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL || Mapbox.StyleURL.Light;

export default Mapbox;
