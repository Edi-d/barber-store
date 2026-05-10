/**
 * MarketplaceSearchModal — full-screen search overlay.
 *
 * Slides down from the top when the CAUTA button on the marketplace
 * home is tapped. Search input is auto-focused on open. Typing
 * filters the catalog client-side with a 250ms debounce.
 *
 * Ported verbatim from Tapzi-barber/components/marketplace/MarketplaceSearchModal.tsx.
 * Adaptations for barber-store:
 *   1. Colors[colorScheme] — already nested in target theme.ts
 *   2. All imports rewritten to @/ aliases
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

import { MarketplaceProductCard } from '@/components/marketplace/MarketplaceProductCard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useMarketplaceCatalog,
  type MarketplaceProduct,
} from '@/hooks/use-marketplace-catalog';
import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Spacing,
} from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const DEBOUNCE_MS = 250;
const CARD_W = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2;

export type MarketplaceSearchModalProps = {
  visible: boolean;
  onClose: () => void;
};

/** Lowercase + strip Romanian diacritics so "foarfeci" matches "FOARFECA". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function MarketplaceSearchModal({
  visible,
  onClose,
}: MarketplaceSearchModalProps): React.JSX.Element | null {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const inputRef = useRef<TextInput>(null);
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');

  const { products } = useMarketplaceCatalog('consumer');

  // Auto-focus input on open
  useEffect(() => {
    if (!visible) {
      setRaw('');
      setQuery('');
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [visible]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [raw]);

  const results = useMemo(() => {
    if (query.length < 2) return [];
    const q = fold(query);
    return products
      .filter((p) => {
        if (!p.is_active || p.stock_qty <= 0) return false;
        const haystack = fold(`${p.name} ${p.brand ?? ''} ${p.sku}`);
        return haystack.includes(q);
      })
      .slice(0, 30);
  }, [products, query]);

  const handleProductPress = useCallback(
    (productId: string) => {
      Haptics.selectionAsync().catch(() => {});
      onClose();
      setTimeout(() => router.push(`/marketplace/product/${productId}` as never), 200);
    },
    [onClose, router],
  );

  const handleClear = useCallback(() => {
    setRaw('');
    inputRef.current?.focus();
  }, []);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Backdrop */}
        <Animated.View
          entering={FadeIn.duration(200).easing(SMOOTH)}
          exiting={FadeOut.duration(180).easing(SMOOTH)}
          style={[StyleSheet.absoluteFillObject, styles.backdrop]}
        >
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          entering={SlideInDown.duration(280).easing(SMOOTH)}
          exiting={SlideOutDown.duration(220).easing(SMOOTH)}
          style={[styles.sheet, { backgroundColor: colors.background }]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            {/* Top bar */}
            <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                  },
                ]}
              >
                <Feather name="search" size={18} color={colors.textTertiary} />
                <TextInput
                  ref={inputRef}
                  value={raw}
                  onChangeText={setRaw}
                  placeholder="Cauta produse, branduri..."
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { color: colors.text }]}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {raw.length > 0 && (
                  <TouchableOpacity
                    onPress={handleClear}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x-circle" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.cancelBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.cancelText, { color: Brand.primary }]}>
                  Anuleaza
                </Text>
              </TouchableOpacity>
            </View>

            {/* Body */}
            {query.length < 2 ? (
              <View style={styles.empty}>
                <Feather name="search" size={48} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Cauta in catalog
                </Text>
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                  Tasteaza cel putin 2 caractere pentru a vedea rezultate.
                  {'\n'}Cauta dupa nume produs, brand sau cod SKU.
                </Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="frown" size={48} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Niciun rezultat
                </Text>
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                  Nu am gasit produse pentru
                  {'\n'}
                  <Text style={{ fontFamily: FontFamily.semiBold }}>
                    &ldquo;{query}&rdquo;
                  </Text>
                </Text>
              </View>
            ) : (
              <FlatList
                data={results}
                keyExtractor={(p) => p.id}
                numColumns={2}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={[
                  styles.grid,
                  { paddingBottom: insets.bottom + Spacing['3xl'] },
                ]}
                renderItem={({ item }: { item: MarketplaceProduct }) => (
                  <View style={styles.gridItem}>
                    <MarketplaceProductCard
                      product={item}
                      onPress={() => handleProductPress(item.id)}
                    />
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />
            )}
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(10,16,28,0.45)',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    height: 44,
    borderWidth: 1,
    ...Bubble.radiiSm,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 14,
    padding: 0,
  },
  cancelBtn: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  cancelText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Spacing['3xl'],
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    letterSpacing: 0.3,
    marginTop: Spacing.md,
  },
  emptyHint: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  grid: {
    paddingHorizontal: Spacing.lg,
  },
  gridRow: {
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  gridItem: {
    width: CARD_W,
  },
});
