// components/shared/PackageGroupCard.tsx
//
// Collapses all upcoming occurrences of one recurring package ("pachet
// recurent") into a single card in the appointments list. Occurrences are
// prepaid, so a single occurrence can be rescheduled (the next one) but not
// individually cancelled — the whole package is cancelled via one action
// (cancel_recurring_package). Mirrors the web's PackageGroup card.
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Bubble, Shadows, FontFamily } from '@/constants/theme';
import type { AppointmentWithDetails } from '@/types/database';
import { formatDate, formatTime } from '@/components/shared/AppointmentCard';

interface PackageGroupCardProps {
  appts: AppointmentWithDetails[];
  index: number;
  onCancelPackage: (packageId: string, remaining: number) => void;
  onReschedule: (appt: AppointmentWithDetails) => void;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
  });
}

export function PackageGroupCard({
  appts,
  index,
  onCancelPackage,
  onReschedule,
}: PackageGroupCardProps) {
  // Sort ascending so "the next one" is the soonest upcoming occurrence.
  const sorted = useMemo(
    () =>
      [...appts].sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      ),
    [appts]
  );

  const next = sorted[0];
  const packageId = next?.package_id ?? '';
  const remaining = sorted.length;
  const serviceName =
    next?.service?.name ??
    next?.services?.[0]?.service?.name ??
    'Serviciu';
  const barberName = next?.barber?.name;

  // Up to 3 upcoming dates as chips, then "+N".
  const previewDates = sorted.slice(0, 3);
  const extraCount = Math.max(0, sorted.length - previewDates.length);

  if (!next) return null;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(320)}>
      <View style={[styles.card, Shadows.md]}>
        <View style={styles.accent} />
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <View style={styles.badge}>
              <Ionicons name="repeat" size={13} color={Colors.primary} />
              <Text style={styles.badgeText}>Pachet recurent</Text>
            </View>
            <View style={styles.countChip}>
              <Text style={styles.countChipText}>
                {remaining} {remaining === 1 ? 'rămasă' : 'rămase'}
              </Text>
            </View>
          </View>

          <Text style={styles.service} numberOfLines={2}>
            {serviceName}
          </Text>

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.metaText}>
              Următoarea: {formatDate(next.scheduled_at)} · {formatTime(next.scheduled_at)}
            </Text>
          </View>
          {barberName ? (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={15} color={Colors.textSecondary} />
              <Text style={styles.metaText}>cu {barberName}</Text>
            </View>
          ) : null}

          <View style={styles.chipsRow}>
            {previewDates.map((a) => (
              <View key={a.id} style={styles.dateChip}>
                <Text style={styles.dateChipText}>{shortDate(a.scheduled_at)}</Text>
              </View>
            ))}
            {extraCount > 0 && <Text style={styles.moreText}>+{extraCount}</Text>}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={styles.rescheduleBtn}
              onPress={() => onReschedule(next)}
              accessibilityRole="button"
            >
              <Ionicons name="calendar" size={15} color={Colors.primary} />
              <Text style={styles.rescheduleText}>Reprogramează următoarea</Text>
            </Pressable>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => onCancelPackage(packageId, remaining)}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle-outline" size={15} color={Colors.error} />
              <Text style={styles.cancelText}>Anulează pachetul</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...Bubble.radii,
  },
  accent: {
    width: 4,
    backgroundColor: Colors.primary,
  },
  body: {
    flex: 1,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primaryMuted,
    paddingHorizontal: 9,
    paddingVertical: 4,
    ...Bubble.radiiSm,
  },
  badgeText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11.5,
    color: Colors.primary,
  },
  countChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    ...Bubble.radiiSm,
  },
  countChipText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11.5,
    color: Colors.textSecondary,
  },
  service: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 3,
  },
  metaText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  dateChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    ...Bubble.radiiSm,
  },
  dateChipText: {
    fontFamily: FontFamily.medium,
    fontSize: 11.5,
    color: Colors.primary,
  },
  moreText: {
    fontFamily: FontFamily.medium,
    fontSize: 11.5,
    color: Colors.textTertiary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  rescheduleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    ...Bubble.radiiSm,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.inputBackground,
  },
  rescheduleText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12.5,
    color: Colors.primary,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...Bubble.radiiSm,
    borderWidth: 1,
    borderColor: Colors.errorMuted,
    backgroundColor: Colors.errorMuted,
  },
  cancelText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12.5,
    color: Colors.error,
  },
});
