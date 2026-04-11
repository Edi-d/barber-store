import { View, StyleSheet } from 'react-native';
import { SkeletonPulse } from '@/components/ui/SkeletonPulse';

export function FeedSkeleton() {
  return (
    <SkeletonPulse>
      <View style={styles.container}>
        {/* Stories row skeleton */}
        <View style={styles.storiesRow}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.storyCircle} />
          ))}
        </View>

        {/* Live section skeleton */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleBar} />
        </View>
        <View style={styles.liveRow}>
          <View style={styles.liveCard} />
          <View style={styles.liveCard} />
        </View>

        {/* Filter chips skeleton */}
        <View style={styles.filterRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.filterChip} />
          ))}
        </View>

        {/* Post cards skeleton */}
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.postCard}>
            {/* Author row */}
            <View style={styles.authorRow}>
              <View style={styles.authorAvatar} />
              <View style={styles.authorTextCol}>
                <View style={styles.authorName} />
                <View style={styles.authorMeta} />
              </View>
            </View>
            {/* Caption */}
            <View style={styles.captionLine1} />
            <View style={styles.captionLine2} />
            {/* Image */}
            <View style={styles.postImage} />
            {/* Actions */}
            <View style={styles.actionsRow}>
              <View style={styles.actionBtn} />
              <View style={styles.actionBtn} />
              <View style={styles.actionBtn} />
            </View>
          </View>
        ))}
      </View>
    </SkeletonPulse>
  );
}

const SKELETON_COLOR = '#E8EDF2';

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  storiesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  storyCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SKELETON_COLOR,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitleBar: {
    width: 140,
    height: 20,
    borderRadius: 6,
    backgroundColor: SKELETON_COLOR,
  },
  liveRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  liveCard: {
    width: 200,
    height: 140,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
    backgroundColor: SKELETON_COLOR,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    width: 80,
    height: 36,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    backgroundColor: SKELETON_COLOR,
  },
  postCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    padding: 14,
    gap: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SKELETON_COLOR,
  },
  authorTextCol: {
    gap: 6,
  },
  authorName: {
    width: 120,
    height: 14,
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
  },
  authorMeta: {
    width: 80,
    height: 10,
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
  },
  captionLine1: {
    width: '90%',
    height: 12,
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
  },
  captionLine2: {
    width: '60%',
    height: 12,
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: SKELETON_COLOR,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  actionBtn: {
    width: 60,
    height: 28,
    borderRadius: 8,
    backgroundColor: SKELETON_COLOR,
  },
});
