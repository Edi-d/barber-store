import { useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, FontFamily, Shadows } from '@/constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Cauta saloane, persoane, postari...',
}: SearchBarProps) {
  const inputRef = useRef<TextInput>(null);

  // Auto-focus on mount
  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={styles.wrapper}>
      {/* Back arrow */}
      <Pressable
        onPress={() => router.back()}
        style={styles.backBtn}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </Pressable>

      {/* Pill input container */}
      <View style={styles.pill}>
        {/* Search icon inside pill */}
        <Feather
          name="search"
          size={17}
          color={Colors.textSecondary}
          style={styles.searchIcon}
        />

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          style={styles.input}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
        />

        {/* Clear X */}
        {value.length > 0 && (
          <Pressable
            onPress={() => onChangeText('')}
            style={styles.clearBtn}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  searchIcon: {
    marginRight: 8,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 0,
    // Remove default Android underline
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  clearBtn: {
    marginLeft: 6,
    flexShrink: 0,
  },
});
