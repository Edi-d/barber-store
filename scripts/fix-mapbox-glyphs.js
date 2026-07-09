/**
 * One-time fix: point the discover-map style's root `glyphs` at the
 * `mihaicristian` account, so custom layers (the salon-pin rating text in
 * components/discover/SalonMarkersLayer.tsx) can resolve "Euclid Circular A
 * Bold". The Standard basemap's Typography→Font setting does NOT do this — it
 * only re-fonts the basemap's own labels. See the note in SalonMarkersLayer.tsx.
 *
 * Why a script and not Studio: the new Studio (Standard-style editor) has no
 * layer flow that rewrites the root glyphs URL, so we set it via the Styles API.
 *
 * Run it once with a SECRET token that has `styles:read` + `styles:write`
 * (create one at https://console.mapbox.com/account/access-tokens/ — it starts
 * with `sk.`). Do NOT commit the token; pass it via env:
 *
 *   MAPBOX_SK=sk.xxxxx node scripts/fix-mapbox-glyphs.js
 *
 * Node 18+ (global fetch). Safe to re-run; delete this file when done.
 */
const USER = "mihaicristian";
const STYLE_ID = "cmq81ik6a002801qwd8v3bgus"; // from EXPO_PUBLIC_MAPBOX_STYLE_URL
const WANT_GLYPHS = `mapbox://fonts/${USER}/{fontstack}/{range}.pbf`;

// Read-only fields the PATCH endpoint rejects if echoed back.
const STRIP = ["created", "modified", "id", "owner", "draft"];

async function main() {
  const sk = process.env.MAPBOX_SK;
  if (!sk || !sk.startsWith("sk.")) {
    console.error("Set MAPBOX_SK to a SECRET token (sk....) with styles:write.");
    process.exit(1);
  }
  const base = `https://api.mapbox.com/styles/v1/${USER}/${STYLE_ID}`;

  console.log("Fetching current style…");
  const getRes = await fetch(`${base}?access_token=${sk}`);
  if (!getRes.ok) {
    console.error(`GET failed: ${getRes.status} ${await getRes.text()}`);
    process.exit(1);
  }
  const style = await getRes.json();
  console.log(`  current glyphs: ${style.glyphs}`);

  if (style.glyphs === WANT_GLYPHS) {
    console.log("Already correct — nothing to do.");
    return;
  }

  style.glyphs = WANT_GLYPHS;
  for (const k of STRIP) delete style[k];

  console.log(`Patching glyphs -> ${WANT_GLYPHS}`);
  const patchRes = await fetch(`${base}?access_token=${sk}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(style),
  });
  const body = await patchRes.text();
  if (!patchRes.ok) {
    console.error(`PATCH failed: ${patchRes.status} ${body}`);
    process.exit(1);
  }
  const updated = JSON.parse(body);
  console.log(`Done. glyphs is now: ${updated.glyphs}`);
  console.log("Reload the app (Mapbox caches styles) to see Euclid on the pins.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
