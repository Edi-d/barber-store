import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';

interface PostActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onReport: () => void;
  onHide: () => void;
  onCopyLink: () => void;
}

const SPRING_CONFIG = { damping: 22, stiffness: 200, mass: 0.8 };

interface ActionRowProps {
  icon: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  iconColor?: string;
}

function ActionRow({ icon, label, onPress, destructive = false, iconColor }: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-x-3 px-5 py-4"
      style={({ pressed }) => [
        styles.actionRow,
        pressed && styles.actionRowPressed,
      ]}
    >
      <View style={[styles.iconWrap, destructive && styles.iconWrapDestructive]}>
        <Ionicons
          name={icon as any}
          size={18}
          color={iconColor ?? (destructive ? '#D32F2F' : Colors.primary)}
        />
      </View>
      <Text style={[styles.actionLabel, destructive && styles.actionLabelDestructive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function OptionsContent({
  onHide,
  onCopyLink,
  onReport,
}: {
  onHide: () => void;
  onCopyLink: () => void;
  onReport: () => void;
}) {
  return (
    <>
      {/* Handle */}
      <View style={styles.handle} />

      {/* Title */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>Opțiuni</Text>
      </View>

      <View style={styles.divider} />

      <ActionRow icon="eye-off-outline" label="Ascunde" onPress={onHide} iconColor={Colors.textSecondary} />
      <View style={styles.rowDivider} />
      <ActionRow icon="link-outline" label="Copiază linkul" onPress={onCopyLink} iconColor={Colors.textSecondary} />

      <View style={styles.divider} />

      <ActionRow icon="flag-outline" label="Raportează" onPress={onReport} destructive />
    </>
  );
}

export default function PostActionSheet({
  visible,
  onClose,
  onReport,
  onHide,
  onCopyLink,
}: PostActionSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdropOpacity.value = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else if (mounted) {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(
        500,
        { duration: 220 },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const dismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleHide = () => {
    onClose();
    setTimeout(() => onHide(), 200);
  };

  const handleCopyLink = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
    setTimeout(() => onCopyLink(), 200);
  };

  const handleReport = () => {
    onClose();
    setTimeout(() => {
      Alert.alert(
        'Raportează postarea',
        'Ești sigur că vrei să raportezi această postare?',
        [
          { text: 'Anulează', style: 'cancel' },
          {
            text: 'Raportează',
            style: 'destructive',
            onPress: () => {
              onReport();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ],
      );
    }, 300);
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={styles.backdropPressable} onPress={dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[styles.sheetContainer, sheetStyle]}
        pointerEvents="box-none"
      >
        <View style={[styles.card, { paddingBottom: insets.bottom + 8 }]}>
          <OptionsContent
            onHide={handleHide}
            onCopyLink={handleCopyLink}
            onReport={handleReport}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdropPressable: {
    flex: 1,
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    backgroundColor: Colors.white,
    overflow: 'hidden',
    ...Bubble.sheetRadii,
    ...Shadows.glass,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.handleBar,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  titleRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.separator,
    marginHorizontal: 0,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.separator,
    marginLeft: 64,
  },
  actionRow: {
    backgroundColor: 'transparent',
  },
  actionRowPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    ...Bubble.radiiSm,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDestructive: {
    backgroundColor: Colors.errorMuted,
  },
  actionLabel: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    fontSize: 15,
  },
  actionLabelDestructive: {
    color: '#D32F2F',
  },
});
