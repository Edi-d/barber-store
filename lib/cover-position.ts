/**
 * lib/cover-position.ts
 *
 * The salon business app lets an owner reposition a salon's cover/banner image
 * by storing a CSS object-position string on `salons.cover_position`
 * (e.g. "50% 30%"). Here we translate that into an expo-image `contentPosition`
 * so the customer app frames the cover with the same focal point.
 *
 * CSS object-position order is horizontal then vertical, which maps to
 * expo-image's { left, top }. Only percent values are stored by the editor, so
 * we accept "<h>% <v>%" and clamp each to 0–100; anything null/blank/malformed
 * returns undefined, letting the caller fall back to expo-image's default
 * (centered) crop.
 */

import type { ImageContentPosition } from "expo-image";

export function parseCoverPosition(
  coverPosition: string | null | undefined,
): ImageContentPosition | undefined {
  if (!coverPosition) return undefined;
  const match = coverPosition.trim().match(/^(\d{1,3})%\s+(\d{1,3})%$/);
  if (!match) return undefined;
  const x = Math.min(100, Math.max(0, parseInt(match[1], 10)));
  const y = Math.min(100, Math.max(0, parseInt(match[2], 10)));
  return { left: `${x}%`, top: `${y}%` };
}
