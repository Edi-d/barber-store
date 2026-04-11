import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Bubble, Shadows } from '@/constants/theme';

const SCREEN_W = Dimensions.get('window').width;

interface ReactionPickerProps {
  visible: boolean;
  position: { x: number; y: number };
  onReact: (emoji: string) => void;
  onClose: () => void;
}

const EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢'];
const PICKER_H = 56;
const EMOJI_SIZE = 38;
const PICKER_W = EMOJIS.length * EMOJI_SIZE + 20; // padding

export function ReactionPicker({ visible, position, onReact, onClose }: ReactionPickerProps) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = visible
      ? withSpring(1, { damping: 14, stiffness: 200 })
      : withTiming(0, { duration: 120 });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  if (!visible) return null;

  // Clamp position so picker doesn't go off screen
  const left = Math.max(8, Math.min(position.x - PICKER_W / 2, SCREEN_W - PICKER_W - 8));
  const top = Math.max(60, position.y - PICKER_H - 16);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop — catches taps outside */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      {/* Picker */}
      <Animated.View style={[st.picker, animStyle, { top, left }]}>
        {EMOJIS.map((emoji, i) => (
          <Animated.View key={emoji} entering={FadeIn.delay(i * 25).duration(140)}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onReact(emoji);
              }}
              style={({ pressed }) => [st.emojiBtn, pressed && st.emojiBtnPressed]}
              hitSlop={4}
            >
              <Text style={st.emoji}>{emoji}</Text>
            </Pressable>
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  picker: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...Bubble.radii,
    ...Shadows.lg,
    zIndex: 9999,
  },
  emojiBtn: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnPressed: {
    transform: [{ scale: 0.8 }],
  },
  emoji: {
    fontSize: 24,
  },
});
