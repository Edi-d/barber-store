/**
 * MarketplaceSearchModal — full-screen search overlay (nopCommerce autocomplete).
 *
 * Slides down from the top when the CAUTA button on the marketplace home is
 * tapped. The input auto-focuses; typing hits the live ElasticSearch autocomplete
 * endpoint (debounced 250ms, ≥2 chars) and renders the suggestions as a list.
 *
 * Routing by entity_type (guide §5):
 *   - Product      → PDP (/marketplace/product/{id})
 *   - Manufacturer → brand screen (best-effort slug from the label)
 *   - Category     → category screen (best-effort slug from the label)
 * The <b>…</b> highlight nop wraps around matches is stripped in lib/nop-catalog.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
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
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { searchAutocomplete, slugify, type SearchResultItem } from '@/lib/nop-catalog';
import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Spacing,
} from '@/constants/theme';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const DEBOUNCE_MS = 250;

export type MarketplaceSearchModalProps = {
  visible: boolean;
  onClose: () => void;
};

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

  // Auto-focus input on open; reset on close.
  useEffect(() => {
    if (!visible) {
      setRaw('');
      setQuery('');
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [visible]);

  // Debounce raw input → query.
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [raw]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['nop', 'autocomplete', query],
    queryFn: () => searchAutocomplete(query),
    enabled: visible && query.length >= 2,
  });

  const handleResultPress = useCallback(
    (item: SearchResultItem) => {
      Haptics.selectionAsync().catch(() => {});
      onClose();
      let route: string | null = null;
      if (item.entity_type === 'Product') {
        route = `/marketplace/product/${item.entity_id}`;
      } else if (item.entity_type === 'Manufacturer') {
        route = `/marketplace/brand/${slugify(item.label)}`;
      } else if (item.entity_type === 'Category') {
        route = `/marketplace/category/${slugify(item.label)}`;
      }
      if (route) {
        setTimeout(() => router.push(route as never), 200);
      }
    },
    [onClose, router],
  );

  const handleClear = useCallback(() => {
    setRaw('');
    inputRef.current?.focus();
  }, []);

  if (!visible) return null;

  const showEmptyResults = query.length >= 2 && !isFetching && results.length === 0;

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
                  placeholder="Caută produse, branduri..."
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
                  Anulează
                </Text>
              </TouchableOpacity>
            </View>

            {/* Body */}
            {query.length < 2 ? (
              <View style={styles.empty}>
                <Feather name="search" size={48} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Caută în catalog
                </Text>
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                  Tastează cel puțin 2 caractere pentru a vedea rezultate.
                  {'\n'}Caută după nume produs sau brand.
                </Text>
              </View>
            ) : showEmptyResults ? (
              <View style={styles.empty}>
                <Feather name="frown" size={48} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Niciun rezultat
                </Text>
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                  Nu am găsit produse pentru
                  {'\n'}
                  <Text style={{ fontFamily: FontFamily.semiBold }}>
                    &ldquo;{query}&rdquo;
                  </Text>
                </Text>
              </View>
            ) : (
              <FlatList
                data={results}
                keyExtractor={(item, idx) => `${item.entity_type}-${item.entity_id}-${idx}`}
                contentContainerStyle={[
                  styles.list,
                  { paddingBottom: insets.bottom + Spacing['3xl'] },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item }: { item: SearchResultItem }) => (
                  <Pressable
                    onPress={() => handleResultPress(item)}
                    style={({ pressed }) => [
                      styles.row,
                      { borderColor: colors.separator },
                      pressed && { backgroundColor: 'rgba(10,102,194,0.04)' },
                    ]}
                  >
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.thumb} resizeMode="contain" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Feather
                          name={item.entity_type === 'Manufacturer' ? 'award' : item.entity_type === 'Category' ? 'grid' : 'package'}
                          size={18}
                          color={colors.textTertiary}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={2}>
                        {item.label}
                      </Text>
                      {item.entity_type !== 'Product' && (
                        <Text style={[styles.rowType, { color: colors.textTertiary }]}>
                          {item.entity_type === 'Manufacturer' ? 'Brand' : item.entity_type === 'Category' ? 'Categorie' : item.entity_type}
                        </Text>
                      )}
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                  </Pressable>
                )}
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
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  rowLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  rowType: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    marginTop: 2,
  },
});
