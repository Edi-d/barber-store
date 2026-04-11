import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/theme';
import { CommentReactionData, ReactionEmoji } from '@/hooks/useCommentReactions';

interface ReactionBubblesProps {
  reactions: CommentReactionData[];
  onToggle: (reaction: ReactionEmoji, hasReacted: boolean) => void;
}

export function ReactionBubbles({ reactions, onToggle }: ReactionBubblesProps) {
  const visible = reactions.filter((r) => r.count > 0).slice(0, 6);

  if (visible.length === 0) return null;

  function handlePress(reaction: ReactionEmoji, hasReacted: boolean) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(reaction, hasReacted);
  }

  return (
    <View style={styles.row}>
      {visible.map((item) => (
        <Pressable
          key={item.reaction}
          onPress={() => handlePress(item.reaction, item.hasReacted)}
          style={[styles.pill, item.hasReacted && styles.pillActive]}
        >
          <Text style={styles.emoji}>{item.reaction}</Text>
          <Text style={[styles.count, item.hasReacted && styles.countActive]}>
            {item.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    gap: 3,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  emoji: {
    fontSize: 13,
    lineHeight: 18,
  },
  count: {
    fontSize: 12,
    fontFamily: 'EuclidCircularA-SemiBold',
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  countActive: {
    color: Colors.primary,
  },
});
