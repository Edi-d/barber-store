import { memo } from "react";
import { Image } from '@/components/ui/Image';

import { TIER_IMAGE, type TierArtKey } from "@/constants/tier-art";

/** Level (1-4) → tier badge art key. */
export const LEVEL_TIER_KEY: Record<number, TierArtKey> = {
  1: "rookie",
  2: "pro",
  3: "elite",
  4: "icon",
};

type Props = {
  tier: TierArtKey;
  size?: number;
};

/** Full-colour loyalty tier badge (Rookie / Pro / Elite / Icon). */
function TierArtInner({ tier, size = 40 }: Props) {
  return (
    <Image
      source={TIER_IMAGE[tier]}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}

export const TierArt = memo(TierArtInner);
