import { Platform, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

interface CreateMenuBackdropProps {
  animatedStyle: any;
  onPress: () => void;
}

export default function CreateMenuBackdrop({ animatedStyle, onPress }: CreateMenuBackdropProps) {
  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onPress}
      accessibilityLabel="Închide meniu"
      accessibilityRole="button"
    >
      {Platform.OS === 'ios' ? (
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <BlurView
            intensity={28}
            tint="systemUltraThinMaterialDark"
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.45)' },
            animatedStyle,
          ]}
        />
      )}
    </Pressable>
  );
}
