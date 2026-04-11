import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Brand, Bubble, Colors, Shadows, Spacing, Typography } from '@/constants/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const slideIn = (delay: number) =>
  FadeInDown.duration(400)
    .delay(delay)
    .easing(SMOOTH)
    .withInitialValues({ transform: [{ translateY: 12 }] });

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${year} - ${hours}:${mins}`;
}

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketCategory = 'general' | 'appointment' | 'order' | 'account' | 'bug';

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  category: TicketCategory;
  status: TicketStatus;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; color: string; icon: React.ComponentProps<typeof Feather>['name'] }
> = {
  open: { label: 'Deschis', color: '#F59E0B', icon: 'clock' },
  in_progress: { label: 'In lucru', color: '#3B82F6', icon: 'loader' },
  resolved: { label: 'Rezolvat', color: '#10B981', icon: 'check-circle' },
  closed: { label: 'Inchis', color: '#6B7280', icon: 'archive' },
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  general: 'General',
  appointment: 'Programare',
  order: 'Comanda',
  account: 'Cont',
  bug: 'Bug',
};

const CATEGORIES: TicketCategory[] = ['general', 'appointment', 'order', 'account', 'bug'];

const colors = Colors;

/* ─── Ticket Card ─── */
function TicketCard({
  ticket,
  isExpanded,
  onToggle,
  delay,
}: {
  ticket: SupportTicket;
  isExpanded: boolean;
  onToggle: () => void;
  delay: number;
}) {
  const statusConfig = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open;
  const categoryLabel = CATEGORY_LABELS[ticket.category] ?? ticket.category;

  return (
    <Animated.View entering={slideIn(delay)}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggle}
        style={[
          styles.card,
          Shadows.md,
          {
            backgroundColor: 'rgba(255,255,255,0.75)',
            borderColor: 'rgba(255,255,255,0.6)',
          },
        ]}
      >
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={[styles.ticketNumber, { color: colors.text }]}>
              #{ticket.id.slice(0, 8).toUpperCase()}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}18` }]}>
              <Feather name={statusConfig.icon} size={12} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
          <Feather
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textTertiary}
          />
        </View>

        {/* Meta row */}
        <View style={styles.cardMeta}>
          <View style={[styles.categoryPill, { backgroundColor: `${Brand.primary}12` }]}>
            <Text style={[styles.categoryPillText, { color: Brand.primary }]}>
              {categoryLabel}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="calendar" size={13} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {formatDate(ticket.created_at)}
            </Text>
          </View>
        </View>

        {/* Subject */}
        <Text style={[styles.subjectText, { color: colors.text }]} numberOfLines={isExpanded ? undefined : 1}>
          {ticket.subject}
        </Text>

        {/* Expanded details */}
        {isExpanded && (
          <View style={[styles.expandedSection, { borderTopColor: colors.separator }]}>
            {/* Message */}
            <View style={styles.messageBlock}>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>Mesajul tau</Text>
              <Text style={[styles.messageText, { color: colors.textSecondary }]}>
                {ticket.message}
              </Text>
            </View>

            {/* Admin reply */}
            {ticket.admin_reply ? (
              <View
                style={[
                  styles.adminReplyBlock,
                  { backgroundColor: Brand.primaryMuted, borderColor: `${Brand.primary}20` },
                ]}
              >
                <View style={styles.adminReplyHeader}>
                  <Feather name="message-square" size={13} color={Brand.primary} />
                  <Text style={[styles.sectionLabel, { color: Brand.primary }]}>Raspuns suport</Text>
                </View>
                <Text style={[styles.messageText, { color: colors.text }]}>
                  {ticket.admin_reply}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ─── New Ticket Modal ─── */
function NewTicketModal({
  visible,
  onClose,
  onCreate,
  isLoading,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: { subject: string; message: string; category: string }) => void;
  isLoading: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<TicketCategory>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleClose = useCallback(() => {
    setCategory('general');
    setSubject('');
    setMessage('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(() => {
    if (!subject.trim() || !message.trim()) return;
    onCreate({ subject: subject.trim(), message: message.trim(), category });
  }, [subject, message, category, onCreate]);

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && !isLoading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        activeOpacity={1}
        style={styles.modalBackdrop}
        onPress={handleClose}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalKeyboardAvoid}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.modalContainer,
            Shadows.lg,
            { paddingBottom: insets.bottom + Spacing.base },
          ]}
        >
          {/* Handle bar */}
          <View style={styles.handleBarWrap}>
            <View style={[styles.handleBar, { backgroundColor: colors.handleBar }]} />
          </View>

          {/* Title */}
          <Text style={[styles.modalTitle, { color: colors.text }]}>Tichet nou</Text>

          {/* Category picker */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  activeOpacity={0.75}
                  onPress={() => setCategory(cat)}
                  style={[
                    styles.categoryChip,
                    selected
                      ? { backgroundColor: Brand.primary }
                      : { backgroundColor: colors.inputBackground },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selected
                        ? { color: '#fff' }
                        : { color: colors.textSecondary },
                    ]}
                  >
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Subject input */}
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subiect"
            placeholderTextColor={colors.textTertiary}
            style={[styles.textInput, styles.subjectInput, { color: colors.text }]}
          />

          {/* Message input */}
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Descrie problema ta..."
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
            style={[styles.textInput, styles.messageInput, { color: colors.text }]}
          />

          {/* Submit button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[Shadows.glow, !canSubmit && styles.submitDisabled]}
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitButton}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Trimite tichetul</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─── Support Screen ─── */
export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: tickets, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['support-tickets', session?.user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
    enabled: !!session,
  });

  const createTicket = useMutation({
    mutationFn: async (ticket: { subject: string; message: string; category: string }) => {
      const { error } = await supabase.from('support_tickets').insert({
        user_id: session!.user.id,
        ...ticket,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      setShowModal(false);
    },
  });

  const toggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        250,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={Brand.primary} />
      </View>
    );
  }

  const isEmpty = !tickets || tickets.length === 0;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ─── Custom Header ─── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          style={[
            styles.backButton,
            {
              backgroundColor: 'rgba(255,255,255,0.65)',
              borderColor: 'rgba(255,255,255,0.9)',
            },
          ]}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Ajutor & Suport</Text>
        <TouchableOpacity
          style={[
            styles.newButton,
            {
              backgroundColor: Brand.primary,
            },
          ]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        /* ─── Empty State ─── */
        <View style={styles.emptyContainer}>
          <Animated.View entering={slideIn(0)} style={styles.emptyContent}>
            <View style={[styles.emptyIconWrap, { backgroundColor: Brand.primaryMuted }]}>
              <Feather name="message-circle" size={44} color={Brand.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Niciun tichet deschis
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              Ai o problema? Trimite-ne un mesaj si te vom ajuta cat de curand.
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowModal(true)}
              style={Shadows.glow}
            >
              <LinearGradient
                colors={[Brand.gradientStart, Brand.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaButton}
              >
                <Feather name="send" size={18} color="#fff" />
                <Text style={styles.ctaButtonText}>Trimite un tichet</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      ) : (
        /* ─── Ticket List ─── */
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Brand.primary}
            />
          }
        >
          {tickets.map((ticket, index) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              isExpanded={expandedId === ticket.id}
              onToggle={() => toggleExpand(ticket.id)}
              delay={index * 60}
            />
          ))}
        </ScrollView>
      )}

      {/* ─── New Ticket Modal ─── */}
      <NewTicketModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onCreate={(data) => createTicket.mutate(data)}
        isLoading={createTicket.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  /* ── Loading ── */
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Navigation Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    ...Bubble.radiiSm,
  },
  newButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radiiSm,
  },
  navTitle: {
    ...Typography.h3,
  },

  /* ── List ── */
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },

  /* ── Card ── */
  card: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    padding: Spacing.base,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ticketNumber: {
    ...Typography.bodySemiBold,
    fontSize: 15,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: {
    ...Typography.smallSemiBold,
    fontSize: 11,
  },

  /* ── Meta ── */
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  categoryPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
  },
  categoryPillText: {
    ...Typography.smallSemiBold,
    fontSize: 11,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...Typography.small,
  },

  /* ── Subject ── */
  subjectText: {
    ...Typography.captionSemiBold,
    marginTop: Spacing.sm,
  },

  /* ── Expanded ── */
  expandedSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  messageBlock: {
    gap: 4,
  },
  sectionLabel: {
    ...Typography.small,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: {
    ...Typography.caption,
    lineHeight: 20,
  },
  adminReplyBlock: {
    padding: Spacing.md,
    ...Bubble.radiiSm,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  adminReplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  /* ── Empty State ── */
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyContent: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.caption,
    textAlign: 'center',
    maxWidth: 260,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    ...Bubble.radii,
  },
  ctaButtonText: {
    ...Typography.button,
    color: '#fff',
  },

  /* ── Modal ── */
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalKeyboardAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.white,
    ...Bubble.sheetRadii,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  handleBarWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  modalTitle: {
    ...Typography.h3,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },

  /* ── Category Chips ── */
  categoryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...Bubble.radiiSm,
  },
  categoryChipText: {
    ...Typography.captionSemiBold,
    fontSize: 13,
  },

  /* ── Inputs ── */
  textInput: {
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    ...Typography.body,
    ...Bubble.radii,
  },
  subjectInput: {
    height: 48,
  },
  messageInput: {
    height: 120,
    paddingTop: Spacing.md,
  },

  /* ── Submit Button ── */
  submitButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radii,
  },
  submitButtonText: {
    ...Typography.button,
    color: '#fff',
  },
  submitDisabled: {
    opacity: 0.55,
  },
});
