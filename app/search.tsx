import { useState, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { SearchBar } from '@/components/search/SearchBar';
import { SearchResultItem } from '@/components/search/SearchResultItem';
import { useSearch, type SearchProfile, type SearchSalon, type SearchPost } from '@/hooks/useSearch';
import { useTrendingTopics } from '@/hooks/useTrendingTopics';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { Colors, FontFamily, Spacing, Radius, Bubble, Shadows } from '@/constants/theme';

// ─── Section data types ───────────────────────────────────────────────────────

type SectionItem =
  | { kind: 'salon'; data: SearchSalon }
  | { kind: 'person'; data: SearchProfile }
  | { kind: 'post'; data: SearchPost };

interface SearchSection {
  title: string;
  data: SectionItem[];
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

// ─── Separator ────────────────────────────────────────────────────────────────

function Separator() {
  return <View style={styles.separator} />;
}

// ─── Idle state: Trending + Recent ────────────────────────────────────────────

interface IdleStateProps {
  trendingTopics: ReturnType<typeof useTrendingTopics>['topics'];
  recentItems: string[];
  onTopicPress: (topic: string) => void;
  onRecentPress: (term: string) => void;
  onRecentRemove: (term: string) => void;
  onClearAll: () => void;
}

function IdleState({
  trendingTopics,
  recentItems,
  onTopicPress,
  onRecentPress,
  onRecentRemove,
  onClearAll,
}: IdleStateProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.idleContainer}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Recent searches */}
      {recentItems.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Cautari recente</Text>
            <Pressable onPress={onClearAll} hitSlop={8}>
              <Text style={styles.clearAllText}>Sterge tot</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            {recentItems.map((term, idx) => (
              <View key={term}>
                <View style={styles.recentRow}>
                  <Pressable
                    onPress={() => onRecentPress(term)}
                    style={styles.recentTermBtn}
                  >
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={Colors.textSecondary}
                      style={{ marginRight: 10 }}
                    />
                    <Text style={styles.recentTerm} numberOfLines={1}>
                      {term}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onRecentRemove(term)}
                    hitSlop={8}
                    style={styles.recentRemoveBtn}
                  >
                    <Ionicons name="close" size={16} color={Colors.textTertiary} />
                  </Pressable>
                </View>
                {idx < recentItems.length - 1 && <Separator />}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Trending topics */}
      {trendingTopics.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>In tendinte</Text>

          <View style={styles.topicsGrid}>
            {trendingTopics.map((topic) => (
              <Pressable
                key={topic.id}
                onPress={() => onTopicPress(topic.name)}
                style={({ pressed }) => [
                  styles.topicChip,
                  pressed && styles.topicChipPressed,
                ]}
              >
                <Text style={styles.topicHash}>#</Text>
                <Text style={styles.topicName} numberOfLines={1}>
                  {topic.name}
                </Text>
                {topic.post_count > 0 && (
                  <Text style={styles.topicCount}>
                    {topic.post_count > 999
                      ? `${(topic.post_count / 1000).toFixed(1)}k`
                      : topic.post_count}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Empty idle placeholder when no trending/recent */}
      {trendingTopics.length === 0 && recentItems.length === 0 && (
        <View style={styles.emptyPlaceholder}>
          <Ionicons name="search-outline" size={56} color={Colors.inputBorder} />
          <Text style={styles.emptyTitle}>Cauta orice</Text>
          <Text style={styles.emptySubtitle}>
            Saloane, frizeri, postari si mai mult
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── No results state ─────────────────────────────────────────────────────────

function NoResults({ query }: { query: string }) {
  return (
    <View style={styles.noResultsContainer}>
      <Ionicons name="search-outline" size={56} color={Colors.inputBorder} />
      <Text style={styles.emptyTitle}>Niciun rezultat</Text>
      <Text style={styles.emptySubtitle}>
        Nu am gasit nimic pentru{' '}
        <Text style={{ fontFamily: FontFamily.semiBold, color: Colors.text }}>
          "{query}"
        </Text>
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const [query, setQuery] = useState('');

  const { profiles, salons, posts, isLoading, hasResults, isEnabled, debouncedQuery } =
    useSearch(query);

  const { topics } = useTrendingTopics();
  const { items: recentItems, add: addRecent, remove: removeRecent, clear: clearRecent } =
    useRecentSearches();

  // Build sections for SectionList
  const sections: SearchSection[] = [];

  if (salons.length > 0) {
    sections.push({
      title: 'Saloane',
      data: salons.map((s) => ({ kind: 'salon' as const, data: s })),
    });
  }

  if (profiles.length > 0) {
    sections.push({
      title: 'Persoane',
      data: profiles.map((p) => ({ kind: 'person' as const, data: p })),
    });
  }

  if (posts.length > 0) {
    sections.push({
      title: 'Postari',
      data: posts.map((p) => ({ kind: 'post' as const, data: p })),
    });
  }

  const handleTopicPress = useCallback((name: string) => {
    setQuery(name);
    Keyboard.dismiss();
  }, []);

  const handleRecentPress = useCallback((term: string) => {
    setQuery(term);
    Keyboard.dismiss();
  }, []);

  const handleResultPress = useCallback(
    (item: SectionItem) => {
      // Save to recent
      if (item.kind === 'salon') {
        addRecent(item.data.name);
        router.push(`/salon/${item.data.id}` as any);
      } else if (item.kind === 'person') {
        addRecent(item.data.display_name ?? item.data.username);
        router.push(`/profile/${item.data.id}` as any);
      } else {
        // Posts: no navigation for now, just record the search
        if (debouncedQuery) addRecent(debouncedQuery);
      }
    },
    [addRecent, debouncedQuery]
  );

  const showIdle = !isEnabled;
  const showLoading = isEnabled && isLoading && !hasResults;
  const showNoResults = isEnabled && !isLoading && !hasResults;
  const showResults = isEnabled && hasResults;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Search Bar */}
        <SearchBar value={query} onChangeText={setQuery} />

        {/* ── Idle state ── */}
        {showIdle && (
          <IdleState
            trendingTopics={topics}
            recentItems={recentItems}
            onTopicPress={handleTopicPress}
            onRecentPress={handleRecentPress}
            onRecentRemove={removeRecent}
            onClearAll={clearRecent}
          />
        )}

        {/* ── Loading ── */}
        {showLoading && (
          <View style={styles.centeredFeedback}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}

        {/* ── No results ── */}
        {showNoResults && <NoResults query={debouncedQuery} />}

        {/* ── Results ── */}
        {showResults && (
          <SectionList<SectionItem, SearchSection>
            sections={sections}
            keyExtractor={(item) =>
              item.kind === 'salon'
                ? `salon-${item.data.id}`
                : item.kind === 'person'
                ? `person-${item.data.id}`
                : `post-${item.data.id}`
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.resultsContainer}
            SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderSectionHeader={({ section }) => (
              <SectionHeader title={section.title} />
            )}
            renderItem={({ item, index, section }) => (
              <View
                style={[
                  styles.resultItemWrapper,
                  index === 0 && styles.resultItemFirst,
                  index === section.data.length - 1 && styles.resultItemLast,
                ]}
              >
                <SearchResultItem
                  type={item.kind}
                  item={item.data as any}
                  onPress={() => handleResultPress(item)}
                />
                {index < section.data.length - 1 && (
                  <View style={styles.itemSeparator} />
                )}
              </View>
            )}
            ListFooterComponent={<View style={{ height: 40 }} />}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Idle ──
  idleContainer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing['2xl'],
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.text,
  },
  clearAllText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.primary,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    ...Shadows.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
  },
  recentTermBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentTerm: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  recentRemoveBtn: {
    paddingLeft: Spacing.sm,
  },
  topicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 2,
    ...Shadows.sm,
  },
  topicChipPressed: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  topicHash: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.primary,
  },
  topicName: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.text,
    maxWidth: 120,
  },
  topicCount: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    color: Colors.textTertiary,
    marginLeft: 4,
  },

  // ── Loading / empty ──
  centeredFeedback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResultsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing['3xl'],
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 18,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // ── Results ──
  resultsContainer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  sectionHeader: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  sectionHeaderText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  resultItemWrapper: {
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  resultItemFirst: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  resultItemLast: {
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.separator,
    marginLeft: Spacing.base + 46 + Spacing.md, // align after avatar
  },
  itemSeparator: {
    height: 1,
    backgroundColor: Colors.separator,
    marginLeft: Spacing.base + 46 + Spacing.md,
  },
});
