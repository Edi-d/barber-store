import { View, Text, Image, Pressable, StyleSheet, Platform, FlatList, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { forwardRef, useState, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SalonWithDistance } from '@/lib/discover';
import { Bubble, Brand, FontFamily } from '@/constants/theme';

const cardShadow = Platform.select({
  ios: { shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10 },
  android: { elevation: 3 },
}) as any;

const PHOTO_HEIGHT = 120;

interface DiscoverSalonCardProps {
  salon: SalonWithDistance;
  photos?: string[];
  onPress?: () => void;
}

function formatDistance(km: number | null): string | null {
  if (km === null) return null;
  if (km < 1) return `${Math.round(km * 1000 / 50) * 50} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const DiscoverSalonCardInner = forwardRef<View, DiscoverSalonCardProps>(
  function DiscoverSalonCard({ salon, photos, onPress }, ref) {
    const photoUri = salon.cover_url ?? salon.avatar_url;
    const rating = salon.rating_avg;
    const distance = formatDistance(salon.distance_km);

    // Build image list: salon_photos first, fallback to cover/avatar
    const images: string[] = photos && photos.length > 0
      ? photos
      : photoUri
        ? [photoUri]
        : [];

    const [activePhotoIndex, setActivePhotoIndex] = useState(0);
    const [cardWidth, setCardWidth] = useState(0);

    const handlePhotoScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (cardWidth <= 0) return;
      const x = e.nativeEvent.contentOffset.x;
      const index = Math.round(x / cardWidth);
      setActivePhotoIndex(index);
    }, [cardWidth]);

    function handlePress() {
      if (onPress) {
        onPress();
      } else {
        router.push(`/salon/${salon.id}`);
      }
    }

    return (
    <View ref={ref} style={[styles.shadowLayer, cardShadow]}>
      <View style={styles.outerWrapper}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [styles.innerClip, pressed && styles.innerClipPressed]}
        >
        {/* ── Photo area ── */}
        <View
          style={styles.photoArea}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && w !== cardWidth) setCardWidth(w);
          }}
        >
          {images.length > 0 && cardWidth > 0 ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handlePhotoScroll}
              keyExtractor={(_, i) => String(i)}
              getItemLayout={(_, index) => ({ length: cardWidth, offset: cardWidth * index, index })}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width: cardWidth, height: PHOTO_HEIGHT }} resizeMode="cover" />
              )}
            />
          ) : (
            <View style={styles.photoFallback}>
              <Ionicons name="cut" size={36} color={Brand.primary} />
            </View>
          )}

          {/* Gradient scrim */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.15)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40 }}
            pointerEvents="none"
          />

          {/* Dot indicators — only when multiple photos */}
          {images.length > 1 && (
            <View style={styles.dotsContainer}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dotIndicator, i === activePhotoIndex && styles.dotIndicatorActive]}
                />
              ))}
            </View>
          )}

          {/* PROMOVAT badge */}
          {salon.is_promoted && (
            <View style={styles.promotedBadge}>
              <Text style={styles.promotedText}>PROMOVAT</Text>
            </View>
          )}

          {/* Favorite heart */}
          {salon.is_favorite && (
            <View style={styles.favoriteButton}>
              <Ionicons name="heart" size={14} color="#EF4444" />
            </View>
          )}
        </View>

        {/* ── Content area ── */}
        <View style={styles.content}>
          {/* Row 1: name + distance (space-between) */}
          <View style={styles.nameRow}>
            <Text style={styles.salonName} numberOfLines={1}>{salon.name}</Text>
            {distance !== null && (
              <Text style={styles.distanceText}>{distance}</Text>
            )}
          </View>

          {/* Row 2: rating stars + review count */}
          <View style={styles.ratingRow}>
            {rating !== null && rating !== undefined && (
              <>
                <Text style={styles.ratingNumber}>{rating.toFixed(1)}</Text>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Ionicons
                    key={i}
                    name={i <= Math.round(rating) ? "star" : "star-outline"}
                    size={12}
                    color="#F59E0B"
                  />
                ))}
                {salon.reviews_count != null && (
                  <Text style={styles.reviewsText}>({salon.reviews_count})</Text>
                )}
              </>
            )}
          </View>

          {/* Row 3: price + availability */}
          <View className="flex-row justify-between items-center mt-2">
            <Text style={styles.priceLabel}>
              {salon.price_range_label ?? ''}
            </Text>

            {salon.is_available_now && (
              <View style={styles.availableBadge}>
                <View style={styles.availableDot} />
                <Text style={styles.availableText}>Liber acum</Text>
              </View>
            )}
          </View>
        </View>
        </Pressable>
      </View>
    </View>
    );
  }
);

export { DiscoverSalonCardInner as DiscoverSalonCard };
export default DiscoverSalonCardInner;

const styles = StyleSheet.create({
  shadowLayer: {
    ...Bubble.radii,
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  outerWrapper: {
    ...Bubble.radii,
    overflow: 'hidden',
  },
  innerClip: {
    // pressable content wrapper
  },
  innerClipPressed: {
    opacity: 0.95,
  },

  // Photo
  photoArea: {
    height: PHOTO_HEIGHT,
    width: '100%',
    backgroundColor: '#E2E8F0',
    position: 'relative',
  },
  photoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EBF5FF',
  },

  // Dot indicators
  dotsContainer: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotIndicatorActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // BOOST badge — dark glass + gold border (matches course PRO badge)
  promotedBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15,15,25,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  promotedText: {
    fontFamily: FontFamily.bold,
    fontSize: 10,
    color: '#d4af37',
    letterSpacing: 1.0,
  },

  // Favorite heart
  favoriteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content
  content: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  salonName: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    color: '#191919',
    flex: 1,
    marginRight: 8,
  },
  distanceText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: '#94A3B8',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  ratingNumber: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: '#191919',
    marginRight: 2,
  },
  reviewsText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 2,
  },
  priceLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Brand.primary,
  },

  // "Liber acum" badge — squircle small (TL 9, TR 4, BR 9, BL 9)
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderTopLeftRadius: 9,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 9,
    borderBottomLeftRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  availableDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  availableText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    color: '#059669',
  },
});
