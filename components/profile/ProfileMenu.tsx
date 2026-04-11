import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Bubble, Colors, FontFamily, Shadows, Spacing } from '@/constants/theme';

interface MenuItem {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: number;
  iconColor: string;
  iconBgColor: string;
  tutorialRef?: React.RefObject<View>;
}

interface ProfileMenuProps {
  items: MenuItem[];
}

export function ProfileMenu({ items }: ProfileMenuProps) {
  return (
    <View style={styles.card}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const showBadge = typeof item.badge === 'number' && item.badge > 0;

        return (
          <Pressable
            key={item.label}
            ref={item.tutorialRef}
            onPress={item.onPress}
            className="flex-row items-center px-[18px] py-[15px] active:opacity-70"
            style={!isLast ? styles.rowBorder : undefined}
          >
            <View style={[styles.iconBox, { backgroundColor: item.iconBgColor }]}>
              <Ionicons
                name={item.icon as any}
                size={19}
                color={item.iconColor}
              />
            </View>

            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>

            {showBadge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            )}

            <Ionicons name="chevron-forward" size={17} color={Colors.textTertiary} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    overflow: 'hidden',
    ...Bubble.radiiLg,
    ...Bubble.accent,
    ...Shadows.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  iconBox: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    ...Bubble.radiiSm,
  },
  label: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    color: Colors.text,
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 8,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: Colors.white,
  },
});
