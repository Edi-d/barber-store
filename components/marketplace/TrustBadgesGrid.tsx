/**
 * TrustBadgesGrid — 2x2 grid of reassurance cards at the bottom of the
 * marketplace home, mirroring the trust section on barber-store.ro.
 *
 * Ported verbatim from Tapzi-barber/components/marketplace/TrustBadgesGrid.tsx.
 * Adaptations for barber-store:
 *   1. Colors[colorScheme] — already nested in target theme.ts
 *   2. All imports rewritten to @/ aliases
 */

import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Shadows,
  Spacing,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Badge = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
};

const BADGES: Badge[] = [
  { key: 'finantare', icon: 'credit-card', title: 'FINANTARE SI PLATA' },
  { key: 'reduceri',  icon: 'percent',     title: 'REDUCERI SAPTAMANALE' },
  { key: 'livrare',   icon: 'truck',       title: 'LIVRARE IN 24 DE ORE' },
  { key: 'gama',      icon: 'package',     title: 'CEA MAI VASTA GAMA DE PRODUSE' },
];

export function TrustBadgesGrid(): React.JSX.Element {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.grid}>
      {BADGES.map((b) => (
        <View
          key={b.key}
          style={[styles.card, Shadows.sm, { backgroundColor: colors.background }]}
        >
          <LinearGradient
            colors={[Brand.gradientStart, Brand.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Feather name={b.icon} size={20} color={Brand.white} />
          </LinearGradient>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={2}
          >
            {b.title}
          </Text>
        </View>
      ))}
    </View>
  );
}

const CARD_W = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: CARD_W,
    minHeight: 110,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Bubble.radii,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
