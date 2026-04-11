import { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

import type { SalonType } from '@/types/database';
import {
  Brand,
  Colors,
  Typography,
  Spacing,
  Bubble,
  Shadows,
} from '@/constants/theme';

const CATEGORY_IMAGES = {
  barbershop: require('@/assets/category-barber.jpg'),
  coafor: require('@/assets/category-coafor.jpg'),
};

const CATEGORIES: {
  type: SalonType;
  title: string;
  subtitle: string;
  cardBg: [string, string];
  accentColor: string;
  glowColor: string;
}[] = [
  {
    type: 'barbershop',
    title: 'Barbershop',
    subtitle: 'Tuns, barbă, fade & grooming',
    cardBg: ['#E8F1FD', '#F7FAFF'],
    accentColor: Brand.primary,
    glowColor: Colors.gradientStart,
  },
  {
    type: 'coafor',
    title: 'Coafor',
    subtitle: 'Coafură, vopsit, styling & tratamente',
    cardBg: ['#FCEAF5', '#FFF7FC'],
    accentColor: '#E91E8C',
    glowColor: '#E91E8C',
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: SalonType) => void;
};

export function CategoryPickerModal({ visible, onClose, onSelect }: Props) {
  const selecting = useRef(false);

  const handleSelect = (type: SalonType) => {
    if (selecting.current) return;
    selecting.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(type);
    setTimeout(() => { selecting.current = false; }, 500);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container}>
        {/* Drag handle */}
        <View style={styles.handleRow} accessible={false}>
          <View style={styles.handle} />
        </View>

        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Logo */}
          <View style={styles.logoRow}>
            <Image
              source={require('@/assets/logo-text.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="tapzi"
              accessibilityRole="image"
            />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.bookingBadge} accessibilityRole="text">
                <Ionicons name="calendar-outline" size={13} color={Brand.primary} />
                <Text style={styles.bookingBadgeText}>Programare nouă</Text>
              </View>

              <Text style={styles.title} accessibilityRole="header">
                Ce tip de salon cauți?
              </Text>
              <Text style={styles.subtitle}>
                Alege categoria pentru a descoperi saloanele disponibile în zona ta
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Închide"
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Category cards */}
          <View style={styles.cardsContainer}>
            {CATEGORIES.map((cat) => {
              const cardShadow = Platform.select({
                ios: {
                  shadowColor: cat.glowColor,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.22,
                  shadowRadius: 16,
                },
                android: { elevation: 6 },
              });

              return (
                <Pressable
                  key={cat.type}
                  onPress={() => handleSelect(cat.type)}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat.title}. ${cat.subtitle}`}
                  accessibilityHint="Apasă pentru a selecta această categorie"
                  style={({ pressed }) => [
                    styles.cardOuter,
                    cardShadow,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <LinearGradient
                    colors={cat.cardBg}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/* Category photo */}
                    <View style={styles.imageWrap}>
                      <Image
                        source={CATEGORY_IMAGES[cat.type]}
                        style={styles.categoryImage}
                        resizeMode="cover"
                      />
                    </View>

                    {/* Text */}
                    <View style={styles.cardTextArea}>
                      <Text style={styles.cardTitle}>{cat.title}</Text>
                      <Text style={styles.cardSubtitle} numberOfLines={2}>
                        {cat.subtitle}
                      </Text>
                    </View>

                    {/* Arrow */}
                    <View style={styles.arrowContainer}>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={cat.accentColor}
                      />
                    </View>
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>

          {/* Bottom hint */}
          <View style={styles.hintRow}>
            <Ionicons name="location-outline" size={15} color={Colors.textTertiary} />
            <Text style={styles.hintText}>
              Vom găsi saloanele cele mai apropiate de tine
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },

  /* ── Handle ── */
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },

  /* ── Logo ── */
  logoRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  logo: {
    width: 72,
    height: 26,
    opacity: 0.85,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  headerContent: {
    flex: 1,
    paddingRight: Spacing.base,
  },
  bookingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    backgroundColor: Brand.primaryMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
    ...Bubble.radiiSm,
  },
  bookingBadgeText: {
    ...Typography.smallSemiBold,
    color: Brand.primary,
  },
  title: {
    ...Typography.h2,
    color: Colors.text,
    marginBottom: Spacing.xs + 2,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },

  /* ── Cards ── */
  cardsContainer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xl,
  },
  cardOuter: {
    ...Bubble.radiiLg,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  cardGradient: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing['2xl'] + 8,
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    ...Bubble.radiiLg,
  },
  imageWrap: {
    width: 88,
    height: 88,
    overflow: 'hidden',
    ...Bubble.radii,
    ...Shadows.md,
  },
  categoryImage: {
    width: '100%',
    height: '100%',
  },
  cardTextArea: {
    flex: 1,
  },
  cardTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  arrowContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...Bubble.radiiSm,
  },

  /* ── Hint ── */
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  hintText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
});
