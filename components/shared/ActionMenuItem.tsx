import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, FontFamily } from '@/constants/theme';

export interface ActionMenuItemProps {
  icon: string;
  label: string;
  iconColor: string;
  iconBg: string;
  onPress: () => void;
  isLast?: boolean;
}

const PRESS_SPRING = { damping: 18, stiffness: 300, mass: 0.6 };

export default function ActionMenuItem({
  icon,
  label,
  iconColor,
  iconBg,
  onPress,
  isLast = false,
}: ActionMenuItemProps) {
  const scale = useSharedValue(1);

  const pressedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={pressedStyle}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={() => { scale.value = withSpring(0.97, PRESS_SPRING); }}
        onPressOut={() => { scale.value = withSpring(1, PRESS_SPRING); }}
      >
        <View style={[styles.row, !isLast && styles.rowBorder]}>
          {/* Icon */}
          <View style={styles.iconShadow}>
            <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
              <Ionicons name={icon as any} size={18} color={iconColor} />
            </View>
          </View>

          {/* Text */}
          <View style={styles.texts}>
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
          </View>

          {/* Chevron */}
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  iconShadow: {
    marginRight: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    marginRight: 8,
  },
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
});
