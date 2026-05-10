/**
 * XpQueueRoot
 *
 * Global overlay component that renders the head of the XP queue store.
 * Shows XPEarnedToast for every earned event, and LevelUpModal when
 * leveled_up is true in the payload.
 *
 * Mount once in app/_layout.tsx after <LoyaltyGlobalOverlays />.
 * The two overlay systems are independent:
 *   - LoyaltyGlobalOverlays — platform XP (appointments + shop orders, DB trigger)
 *   - XpQueueRoot — shop marketplace XP (earn_xp_from_purchase RPC, explicit call)
 */

import { useState, useEffect } from 'react';
import { useXpQueueStore } from '@/stores/xpQueueStore';
import { XPEarnedToast } from '@/components/shop-gamification/XPEarnedToast';
import { LevelUpModal } from '@/components/shop-gamification/LevelUpModal';

export function XpQueueRoot() {
  const queue = useXpQueueStore((s) => s.queue);
  const dequeue = useXpQueueStore((s) => s.dequeue);

  const current = queue[0] ?? null;
  const [showLevelUp, setShowLevelUp] = useState(false);

  // When the head of the queue changes to a leveled-up event, raise the modal.
  useEffect(() => {
    if (current?.leveled_up) {
      setShowLevelUp(true);
    }
  }, [current?.id]);

  const handleToastDismiss = () => {
    // If there's no level-up modal pending, move immediately to the next item.
    if (!showLevelUp) {
      dequeue();
    }
  };

  const handleLevelUpDismiss = () => {
    setShowLevelUp(false);
    dequeue();
  };

  return (
    <>
      <XPEarnedToast
        visible={!!current}
        xp={current?.xp ?? 0}
        source={current?.source ?? 'Ai castigat XP!'}
        onDismiss={handleToastDismiss}
      />
      <LevelUpModal
        visible={showLevelUp}
        newLevel={current?.newLevel ?? 1}
        onDismiss={handleLevelUpDismiss}
      />
    </>
  );
}
