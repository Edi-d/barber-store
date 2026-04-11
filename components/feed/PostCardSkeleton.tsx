import { View, StyleSheet } from 'react-native';
import { SkeletonPulse } from '@/components/ui/SkeletonPulse';

const SKELETON_COLOR = '#E8EDF2';

export function PostCardSkeleton() {
  return (
    <SkeletonPulse>
      <View style={styles.card}>
        {/* Author row */}
        <View style={styles.authorRow}>
          <View style={styles.avatar} />
          <View style={styles.authorInfo}>
            <View style={styles.namePlaceholder} />
            <View style={styles.metaPlaceholder} />
          </View>
        </View>

        {/* Caption lines */}
        <View style={styles.captionLong} />
        <View style={styles.captionShort} />

        {/* Media placeholder */}
        <View style={styles.media} />

        {/* Action buttons row */}
        <View style={styles.actionsRow}>
          <View style={styles.actionPill} />
          <View style={styles.actionPill} />
          <View style={styles.actionPill} />
        </View>
      </View>
    </SkeletonPulse>
  );
}

export function PostCardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // List wrapper
  list: {
    gap: 14,
    paddingHorizontal: 16,
  },

  // Card shell — squircle using Bubble.radii values
  card: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
  },

  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: SKELETON_COLOR,
  },
  authorInfo: {
    gap: 6,
  },
  namePlaceholder: {
    width: 130,
    height: 14,
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
  },
  metaPlaceholder: {
    width: 90,
    height: 10,
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
  },

  // Caption lines
  captionLong: {
    width: '92%',
    height: 12,
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
    marginBottom: 6,
  },
  captionShort: {
    width: '55%',
    height: 12,
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
    marginBottom: 12,
  },

  // Media block
  media: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 14,
    backgroundColor: SKELETON_COLOR,
  },

  // Actions row — squircle pills matching app action button shape
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionPill: {
    width: 64,
    height: 28,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
    backgroundColor: SKELETON_COLOR,
  },
});
