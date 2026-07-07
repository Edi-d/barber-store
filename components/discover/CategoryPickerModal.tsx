import { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from '@/components/ui/Image';
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

// Every salon category has dedicated photography in assets/categories/*.webp.
// Any category without an image here falls back to an icon tile (CATEGORY_ICONS).
const CATEGORY_IMAGES: Partial<Record<SalonType, any>> = {
  barbershop: require('@/assets/categories/barber.webp'),
  coafor: require('@/assets/categories/coafor.webp'),
  manichiura: require('@/assets/categories/manichiura.webp'),
  masaj: require('@/assets/categories/masaj.webp'),
  beauty: require('@/assets/categories/beauty.webp'),
  epilare: require('@/assets/categories/epilare.webp'),
  gene: require('@/assets/categories/gene.webp'),
  tatuaj: require('@/assets/categories/tatuaj.webp'),
  altele: require('@/assets/categories/altele.webp'),
};

const CATEGORY_ICONS: Partial<Record<SalonType, keyof typeof Ionicons.glyphMap>> = {
  manichiura: 'hand-left-outline',
  masaj: 'body-outline',
  beauty: 'sparkles-outline',
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
  {
    type: 'manichiura',
    title: 'Manichiură',
    subtitle: 'Manichiură, pedichiură & unghii',
    cardBg: ['#FDF2E9', '#FFFAF5'],
    accentColor: '#D97706',
    glowColor: '#D97706',
  },
  {
    type: 'masaj',
    title: 'Masaj',
    subtitle: 'Masaj relaxant & terapeutic',
    cardBg: ['#E8F8F1', '#F5FEFA'],
    accentColor: '#0E9F6E',
    glowColor: '#0E9F6E',
  },
  {
    type: 'beauty',
    title: 'Beauty',
    subtitle: 'Cosmetică, machiaj & tratamente faciale',
    cardBg: ['#F3E8FD', '#FAF5FF'],
    accentColor: '#8B5CF6',
    glowColor: '#8B5CF6',
  },
  {
    type: 'epilare',
    title: 'Epilare',
    subtitle: 'Epilare cu laser, ceară & definitivă',
    cardBg: ['#FEE9EC', '#FFF6F7'],
    accentColor: '#F43F5E',
    glowColor: '#F43F5E',
  },
  {
    type: 'gene',
    title: 'Gene',
    subtitle: 'Extensii gene, laminare & sprâncene',
    cardBg: ['#EAECFD', '#F6F7FF'],
    accentColor: '#6366F1',
    glowColor: '#6366F1',
  },
  {
    type: 'tatuaj',
    title: 'Tatuaj',
    subtitle: 'Tatuaje, piercing & body art',
    cardBg: ['#EDF0F4', '#F8FAFC'],
    accentColor: '#334155',
    glowColor: '#334155',
  },
  {
    type: 'altele',
    title: 'Altele',
    subtitle: 'Alte servicii de îngrijire & frumusețe',
    cardBg: ['#E2F6FB', '#F2FCFE'],
    accentColor: '#06B6D4',
    glowColor: '#06B6D4',
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: SalonType | null) => void;
};

export function CategoryPickerModal({ visible, onClose, onSelect }: Props) {
  const selecting = useRef(false);

  const handleSelect = (type: SalonType | null) => {
    if (selecting.current) return;
    selecting.current = true;
    Haptics.impactAsync(
      type !== null
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
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
              source={require('@/assets/logo-text.webp')}
              style={styles.logo}
              contentFit="contain"
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
                    {/* Category photo (or icon tile when no photography exists yet) */}
                    {CATEGORY_IMAGES[cat.type] ? (
                      <View style={styles.imageWrap}>
                        <Image
                          source={CATEGORY_IMAGES[cat.type]}
                          style={styles.categoryImage}
                          contentFit="cover"
                        />
                      </View>
                    ) : (
                      <View style={[styles.imageWrap, styles.iconTileWrap, { backgroundColor: cat.accentColor + '14' }]}>
                        <Ionicons
                          name={CATEGORY_ICONS[cat.type] ?? 'sparkles-outline'}
                          size={32}
                          color={cat.accentColor}
                        />
                      </View>
                    )}

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

            {/* Toate saloanele — subordinate pill card */}
            <Pressable
              onPress={() => handleSelect(null)}
              accessibilityRole="button"
              accessibilityLabel="Toate saloanele. Barber, coafor, manichiură, masaj, beauty și tot ce e între"
              accessibilityHint="Apasă pentru a vedea toate saloanele fără filtru"
              style={({ pressed }) => [
                styles.mixtCardOuter,
                pressed && styles.cardPressed,
              ]}
            >
              <LinearGradient
                colors={['#F4F5F7', '#FAFBFC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mixtCardGradient}
              >
                {/* Glyph */}
                <View style={styles.mixtGlyphWrap}>
                  <Ionicons name="apps-outline" size={22} color="#64748B" />
                </View>

                {/* Text */}
                <View style={styles.mixtTextArea}>
                  <Text style={styles.mixtTitle}>Toate saloanele</Text>
                  <Text style={styles.mixtSubtitle} numberOfLines={1}>
                    Toate categoriile, fără filtru
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>
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
    paddingLeft: 0,
    paddingRight: Spacing['2xl'],
    gap: Spacing.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    height: 144,
    ...Bubble.radiiLg,
  },
  imageWrap: {
    width: 112,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  categoryImage: {
    width: '100%',
    height: '100%',
  },
  iconTileWrap: {
    alignItems: 'center',
    justifyContent: 'center',
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

  /* ── Toate saloanele pill card ── */
  mixtCardOuter: {
    ...Bubble.radiiSm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 2 },
    }),
  },
  mixtCardGradient: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
    ...Bubble.radiiSm,
  },
  mixtGlyphWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(100,116,139,0.10)',
    ...Bubble.radiiSm,
  },
  mixtTextArea: {
    flex: 1,
  },
  mixtTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  mixtSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
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
