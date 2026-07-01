import { memo, useMemo } from "react";
import { SvgXml } from "react-native-svg";

import { TIER_SVG, type TierArtKey } from "@/constants/tier-svg";

/** Level (1-4) → tier badge art key. */
export const LEVEL_TIER_KEY: Record<number, TierArtKey> = {
  1: "clipper",
  2: "blade",
  3: "sharp",
  4: "maestru",
};

/**
 * Namespaces every `id` in an SVG string (and its `url(#id)` / `href="#id"`
 * refs). Two badge SVGs reuse ids like `SVGID_1_` / `linear-gradient`; without
 * this, rendering two at once makes react-native-svg resolve the wrong gradient.
 */
function namespaceIds(svg: string, prefix: string): string {
  const ids = new Set<string>();
  const re = /id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) ids.add(m[1]);

  let out = svg;
  ids.forEach((id) => {
    const nid = `${prefix}-${id}`;
    out = out
      .split(`id="${id}"`).join(`id="${nid}"`)
      .split(`url(#${id})`).join(`url(#${nid})`)
      .split(`href="#${id}"`).join(`href="#${nid}"`);
  });
  return out;
}

type Props = {
  tier: TierArtKey;
  size?: number;
};

/** Full-colour loyalty tier badge (Clipper / Blade / Sharp / Maestru). */
function TierArtInner({ tier, size = 40 }: Props) {
  const xml = useMemo(() => namespaceIds(TIER_SVG[tier], tier), [tier]);
  return <SvgXml xml={xml} width={size} height={size} />;
}

export const TierArt = memo(TierArtInner);
