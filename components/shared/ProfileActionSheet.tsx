import { useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';

interface ProfileActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onShare: () => void;
  onCopyLink: () => void;
  onReport: () => void;
  onBlock: () => void;
  targetName?: string;
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
          color={iconColor ?? (destructive ? Colors.error : Colors.primary)}
        />
      </View>
      <Text style={[styles.actionLabel, destructive && styles.actionLabelDestructive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ProfileActionSheet({
  visible,
  onClose,
  onShare,
  onCopyLink,
  onReport,
  onBlock,
  targetName,
}: ProfileActionSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withSpring(400, SPRING_CONFIG);
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

  const handleShare = () => {
    onClose();
    setTimeout(() => onShare(), 200);
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
        'Raportează utilizatorul',
        `Ești sigur că vrei să raportezi ${targetName ? `pe ${targetName}` : 'acest utilizator'}?`,
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

  const handleBlock = () => {
    onClose();
    setTimeout(() => {
      Alert.alert(
        'Blochează utilizatorul',
        `Ești sigur că vrei să blochezi ${targetName ? `pe ${targetName}` : 'acest utilizator'}? Nu vei mai vedea postările acestuia.`,
        [
          { text: 'Anulează', style: 'cancel' },
          {
            text: 'Blochează',
            style: 'destructive',
            onPress: () => {
              onBlock();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            },
          },
        ],
      );
    }, 300);
  };

  return (
    <Modal
      visible={visible}
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
        style={[
          styles.sheetContainer,
          sheetStyle,
          { paddingBottom: insets.bottom + 8 },
        ]}
        pointerEvents="box-none"
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={80} tint="light" style={styles.blurSheet}>
            <SheetContent
              onShare={handleShare}
              onCopyLink={handleCopyLink}
              onReport={handleReport}
              onBlock={handleBlock}
              onDismiss={dismiss}
            />
          </BlurView>
        ) : (
          <View style={styles.solidSheet}>
            <SheetContent
              onShare={handleShare}
              onCopyLink={handleCopyLink}
              onReport={handleReport}
              onBlock={handleBlock}
              onDismiss={dismiss}
            />
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

interface SheetContentProps {
  onShare: () => void;
  onCopyLink: () => void;
  onReport: () => void;
  onBlock: () => void;
  onDismiss: () => void;
}

function SheetContent({ onShare, onCopyLink, onReport, onBlock, onDismiss }: SheetContentProps) {
  return (
    <>
      {/* Handle */}
      <View style={styles.handle} />

      {/* Title */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>Opțiuni</Text>
      </View>

      <View style={styles.divider} />

      <ActionRow icon="share-social-outline" label="Distribuie profilul" onPress={onShare} />
      <View style={styles.rowDivider} />
      <ActionRow icon="link-outline" label="Copiază linkul" onPress={onCopyLink} iconColor={Colors.textSecondary} />

      <View style={styles.divider} />

      <ActionRow icon="flag-outline" label="Raportează" onPress={onReport} destructive />
      <View style={styles.rowDivider} />
      <ActionRow icon="ban-outline" label="Blochează" onPress={onBlock} destructive />

      <View style={styles.divider} />

      <Pressable
        onPress={onDismiss}
        className="items-center py-4"
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
      >
        <Text style={styles.cancelText}>Anulează</Text>
      </Pressable>
    </>
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
  blurSheet: {
    marginHorizontal: 12,
    marginBottom: 8,
    ...Bubble.sheetRadii,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.glass,
  },
  solidSheet: {
    marginHorizontal: 12,
    marginBottom: 8,
    ...Bubble.sheetRadii,
    overflow: 'hidden',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.separator,
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
    width: 36,
    height: 36,
    borderRadius: 10,
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
    color: Colors.error,
  },
  cancelBtn: {
    backgroundColor: 'transparent',
  },
  cancelBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  cancelText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
