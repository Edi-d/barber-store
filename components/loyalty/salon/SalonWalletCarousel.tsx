import React from 'react';
import { View, StyleSheet, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Colors, Spacing } from '@/constants/theme';
import type { SalonLoyaltyCard } from '@/lib/salon-loyalty';
import { SalonWalletCard } from './SalonWalletCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.82);
const GAP = 14;
const SNAP = CARD_WIDTH + GAP;
const SIDEPAD = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2);
const CARD_HEIGHT = 196;

interface Props {
  cards: SalonLoyaltyCard[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
}

/** One slide — scaled/faded by its distance from the centered position. */
function CarouselItem({
  card,
  index,
  scrollX,
}: {
  card: SalonLoyaltyCard;
  index: number;
  scrollX: { value: number };
}) {
  const animStyle = useAnimatedStyle(() => {
    const pos = scrollX.value / SNAP;
    const scale = interpolate(
      pos,
      [index - 1, index, index + 1],
      [0.92, 1, 0.92],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      pos,
      [index - 1, index, index + 1],
      [0.55, 1, 0.55],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }], opacity };
  });

  return (
    <Animated.View style={[styles.item, animStyle]}>
      <SalonWalletCard card={card} width={CARD_WIDTH} height={CARD_HEIGHT} />
    </Animated.View>
  );
}

export function SalonWalletCarousel({ cards, selectedIndex, onIndexChange }: Props) {
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
    const clamped = Math.max(0, Math.min(cards.length - 1, idx));
    if (clamped !== selectedIndex) onIndexChange(clamped);
  };

  // Single card: no need to scroll.
  if (cards.length === 1) {
    return (
      <View style={styles.singleWrap}>
        <SalonWalletCard card={cards[0]} width={CARD_WIDTH} height={CARD_HEIGHT} />
      </View>
    );
  }

  return (
    <View>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{
          paddingLeft: SIDEPAD,
          paddingRight: Math.max(0, SIDEPAD - GAP),
        }}
      >
        {cards.map((card, i) => (
          <CarouselItem key={card.salonId} card={card} index={i} scrollX={scrollX} />
        ))}
      </Animated.ScrollView>

      {/* Page dots */}
      <View style={styles.dots}>
        {cards.map((c, i) => (
          <View
            key={c.salonId}
            style={[styles.dot, i === selectedIndex ? styles.dotActive : styles.dotIdle]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    width: CARD_WIDTH,
    marginRight: GAP,
  },
  singleWrap: {
    paddingHorizontal: SIDEPAD,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.md,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    backgroundColor: Colors.primary,
  },
  dotIdle: {
    width: 6,
    backgroundColor: 'rgba(10,102,194,0.25)',
  },
});
