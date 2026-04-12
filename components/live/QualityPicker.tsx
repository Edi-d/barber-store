import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { VideoQualityOption } from '@/hooks/useLiveConnection';

interface QualityPickerProps {
  visible: boolean;
  currentQuality: VideoQualityOption;
  onSelect: (quality: VideoQualityOption) => void;
  onClose: () => void;
  topOffset: number;
}

const QUALITY_OPTIONS: { value: VideoQualityOption; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
];

const ACCENT = '#4481EB';

export default function QualityPicker({
  visible,
  currentQuality,
  onSelect,
  onClose,
  topOffset,
}: QualityPickerProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.01)' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          accessibilityRole="menu"
          accessibilityViewIsModal
          style={{
            position: 'absolute',
            right: 12,
            top: topOffset,
            width: 150,
            backgroundColor: '#1a1a1a',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            overflow: 'hidden',
            // iOS shadow
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.5,
            shadowRadius: 16,
            // Android shadow
            elevation: 20,
          }}
        >
          {QUALITY_OPTIONS.map((option, index) => {
            const selected = option.value === currentQuality;
            const last = index === QUALITY_OPTIONS.length - 1;

            return (
              <View key={option.value}>
                <Pressable
                  onPress={() => { onSelect(option.value); onClose(); }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 13,
                    paddingHorizontal: 16,
                    backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent',
                  })}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: 'EuclidCircularA-Medium',
                      color: selected ? ACCENT : 'rgba(255,255,255,0.88)',
                    }}
                  >
                    {option.label}
                  </Text>
                  {selected && (
                    <Feather name="check" size={16} color={ACCENT} />
                  )}
                </Pressable>
                {!last && (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      marginLeft: 16,
                      marginRight: 16,
                    }}
                  />
                )}
              </View>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
