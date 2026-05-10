/**
 * ReviewPhotoStrip — web fallback
 *
 * Identical strip layout to ReviewPhotoStrip.tsx, except react-native-image-viewing
 * is replaced with a custom full-screen Modal using react-native's built-in Modal.
 *
 * Features:
 * - Same thumbnail strip (ScrollView for >= 4 photos, row otherwise)
 * - Full-screen lightbox via RN Modal (works on web via react-native-web)
 * - Left / right arrow buttons for multi-image navigation
 * - Tap on overlay backdrop to close
 *
 * Mobile (iOS/Android) loads ReviewPhotoStrip.tsx — this file is web-only.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Image,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
  Text,
  SafeAreaView,
} from 'react-native';

interface ReviewPhotoStripProps {
  photos: string[];
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function ReviewPhotoStrip({ photos }: ReviewPhotoStripProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const openAt = useCallback((i: number) => setViewerIndex(i), []);
  const close = useCallback(() => setViewerIndex(null), []);

  const goNext = useCallback(() => {
    setViewerIndex((prev) => (prev === null ? null : Math.min(prev + 1, photos.length - 1)));
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setViewerIndex((prev) => (prev === null ? null : Math.max(prev - 1, 0)));
  }, []);

  if (photos.length === 0) return null;

  const isCarousel = photos.length >= 4;
  const currentIndex = viewerIndex ?? 0;

  const renderThumb = (uri: string, i: number) => (
    <Pressable
      key={`${uri}-${i}`}
      onPress={() => openAt(i)}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Image
        source={{ uri }}
        style={{ width: 96, height: 96, borderRadius: 12 }}
        resizeMode="cover"
      />
    </Pressable>
  );

  return (
    <View style={{ marginTop: 8 }}>
      {/* ── Thumbnail strip ── */}
      {isCarousel ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          {photos.map(renderThumb)}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {photos.map(renderThumb)}
        </View>
      )}

      {/* ── Lightbox Modal ── */}
      <Modal
        visible={viewerIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
      >
        <View style={styles.lightboxOverlay}>
          {/* Tap-to-close backdrop */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={close} />

          {/* Image */}
          <Image
            source={{ uri: photos[currentIndex] }}
            style={styles.lightboxImage}
            resizeMode="contain"
          />

          {/* Counter */}
          {photos.length > 1 && (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {currentIndex + 1} / {photos.length}
              </Text>
            </View>
          )}

          {/* Left arrow */}
          {currentIndex > 0 && (
            <Pressable
              style={[styles.arrowBtn, styles.arrowLeft]}
              onPress={goPrev}
              hitSlop={12}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
          )}

          {/* Right arrow */}
          {currentIndex < photos.length - 1 && (
            <Pressable
              style={[styles.arrowBtn, styles.arrowRight]}
              onPress={goNext}
              hitSlop={12}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          )}

          {/* Close button */}
          <Pressable style={styles.closeBtn} onPress={close} hitSlop={12}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
  counter: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  counterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  arrowBtn: {
    position: 'absolute',
    top: '50%',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    // translateY to vertically center relative to the anchor point
    marginTop: -24,
  },
  arrowLeft: {
    left: 16,
  },
  arrowRight: {
    right: 16,
  },
  arrowText: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '300',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
  },
});
