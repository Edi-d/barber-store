import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Barber, BarberService } from '@/types/database';
import { Colors, Shadows, Typography } from '@/constants/theme';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookingConfirmationProps {
  barber: Barber;
  services: BarberService[];
  selectedDate: Date;
  selectedTime: string;
  notes: string;
  onNotesChange: (text: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  formatPrice: (cents: number, currency: string) => string;
  summaryCardRef?: React.RefObject<View>;
  notesInputRef?: React.RefObject<View>;
  confirmBtnRef?: React.RefObject<View>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS_RO = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];

function formatDateRomanian(date: Date): { line1: string; line2?: string } {
  const day = DAYS_RO[date.getDay()];
  const num = date.getDate();
  const month = MONTHS_RO[date.getMonth()];
  return { line1: `${day}, ${num} ${month}` };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Barber row — staggers in with FadeInRight at delay 0. */
function BarberRow({ barber }: { barber: Barber }) {
  return (
    <Animated.View entering={FadeInRight.delay(100).duration(250)} style={styles.row}>
      <View style={styles.avatarWrap}>
        {barber.avatar_url ? (
          <Image source={{ uri: barber.avatar_url }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={22} color={Colors.primary} />
          </View>
        )}
      </View>

      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>Frizer</Text>
        <Text style={styles.rowTitle}>{barber.name}</Text>
        {barber.role ? (
          <Text style={styles.rowSub}>
            {barber.role === 'owner' ? 'Proprietar' : 'Frizer'}
          </Text>
        ) : null}
      </View>

      <View style={styles.checkCircle}>
        <Ionicons name="checkmark-circle" size={26} color={Colors.primary} />
      </View>
    </Animated.View>
  );
}

/** Single service row inside the services section. */
function ServiceRow({
  service,
  isLast,
  delay,
  formatPrice,
}: {
  service: BarberService;
  isLast: boolean;
  delay: number;
  formatPrice: (cents: number, currency: string) => string;
}) {
  return (
    <Animated.View entering={FadeInRight.delay(delay).duration(250)}>
      <View style={styles.serviceRow}>
        <View style={styles.serviceIconWrap}>
          <Ionicons name="cut" size={16} color={Colors.primary} />
        </View>

        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName}>{service.name}</Text>
          <Text style={styles.serviceDuration}>{service.duration_min} min</Text>
        </View>

        <Text style={styles.servicePrice}>
          {formatPrice(service.price_cents, service.currency)}
        </Text>
      </View>

      {!isLast && <View style={styles.serviceDivider} />}
    </Animated.View>
  );
}

/** Date / time row. */
function DateTimeRow({ date, time }: { date: Date; time: string }) {
  const { line1 } = formatDateRomanian(date);

  return (
    <Animated.View entering={FadeInRight.delay(300).duration(250)} style={styles.row}>
      <View style={styles.iconBox}>
        <Ionicons name="calendar" size={20} color={Colors.primary} />
      </View>

      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>Data & Ora</Text>
        <Text style={styles.rowTitle}>{line1}</Text>
        <Text style={styles.timeText}>{time}</Text>
      </View>
    </Animated.View>
  );
}

/** Animated count-up display for the total price string.
 *
 * Strategy: we animate a shared value from 0 → totalCents over 600 ms
 * and derive the formatted label on every frame via a JS-driven derived
 * value.  Because formatPrice runs on the JS thread we use a simple
 * useState + useEffect approach — accurate, no native-driver issues.
 */
function AnimatedTotal({
  totalCents,
  currency,
  formatPrice,
}: {
  totalCents: number;
  currency: string;
  formatPrice: (cents: number, currency: string) => string;
}) {
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);
  const [displayLabel, setDisplayLabel] = useState(
    formatPrice(0, currency)
  );

  useEffect(() => {
    const DURATION = 600;
    startRef.current = Date.now();

    // Drive with a JS interval so we can call formatPrice freely
    frameRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const t = Math.min(elapsed / DURATION, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(eased * totalCents);
      setDisplayLabel(formatPrice(current, currency));

      if (t >= 1) {
        if (frameRef.current) clearInterval(frameRef.current);
        setDisplayLabel(formatPrice(totalCents, currency));
      }
    }, 16);

    return () => {
      if (frameRef.current) clearInterval(frameRef.current);
    };
  }, [totalCents, currency]);

  return <Text style={styles.totalAmount}>{displayLabel}</Text>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BookingConfirmation({
  barber,
  services,
  selectedDate,
  selectedTime,
  notes,
  onNotesChange,
  onSubmit,
  isSubmitting,
  formatPrice,
  summaryCardRef,
  notesInputRef,
  confirmBtnRef,
}: BookingConfirmationProps) {
  // Derived totals
  const totalCents = services.reduce((sum, s) => sum + s.price_cents, 0);
  const totalDuration = services.reduce((sum, s) => sum + s.duration_min, 0);
  const currency = services[0]?.currency ?? 'RON';
  const hasMultiple = services.length > 1;

  // No pulse animation — clean static button

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.root}>
      {/* ------------------------------------------------------------------ */}
      {/* Summary card                                                         */}
      {/* ------------------------------------------------------------------ */}
      <View ref={summaryCardRef} style={[styles.card, Shadows.md]}>
        {/* Barber row */}
        <BarberRow barber={barber} />

        <View style={styles.divider} />

        {/* Services section */}
        <Animated.View
          entering={FadeInRight.delay(200).duration(250)}
          style={styles.servicesSection}
        >
          <Text style={styles.servicesSectionHeader}>
            Servicii selectate ({services.length})
          </Text>

          {services.map((service, idx) => (
            <ServiceRow
              key={service.id}
              service={service}
              isLast={idx === services.length - 1}
              delay={220 + idx * 80}
              formatPrice={formatPrice}
            />
          ))}
        </Animated.View>

        <View style={styles.divider} />

        {/* Date & time row */}
        <DateTimeRow date={selectedDate} time={selectedTime} />
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Notes input                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Animated.View entering={FadeInRight.delay(400).duration(250)} style={styles.notesWrap}>
        <Text style={styles.notesLabel}>Note (opțional)</Text>
        <View ref={notesInputRef}>
          <Input
            placeholder="Ex: Fade mediu, păstrat lungimea sus..."
            value={notes}
            onChangeText={onNotesChange}
            multiline
            numberOfLines={3}
            autoCapitalize="sentences"
          />
        </View>
      </Animated.View>

      {/* ------------------------------------------------------------------ */}
      {/* Total bar                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Animated.View entering={FadeInRight.delay(480).duration(250)} style={styles.totalBar}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          {hasMultiple && (
            <Text style={styles.totalDuration}>Durată totală: {totalDuration} min</Text>
          )}
        </View>
        <AnimatedTotal
          totalCents={totalCents}
          currency={currency}
          formatPrice={formatPrice}
        />
      </Animated.View>

      {/* ------------------------------------------------------------------ */}
      {/* Submit button with pulse wrapper                                     */}
      {/* ------------------------------------------------------------------ */}
      {/* Submit button */}
      <Animated.View entering={FadeInDown.delay(400).duration(250)}>
        <View ref={confirmBtnRef}>
          <Button
            onPress={onSubmit}
            loading={isSubmitting}
            size="lg"
            icon={
              !isSubmitting ? (
                <Ionicons name="checkmark-circle" size={22} color={Colors.white} />
              ) : undefined
            }
          >
            Confirmă Programarea
          </Button>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },

  // --- Card ---
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },

  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
  },

  // --- Barber row ---
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    marginRight: 12,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  avatarFallback: {
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowInfo: {
    flex: 1,
  },

  rowLabel: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginBottom: 1,
  },

  rowTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },

  rowSub: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 1,
  },

  checkCircle: {
    marginLeft: 8,
  },

  // --- Icon box (date/time row) ---
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  timeText: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
    marginTop: 2,
  },

  // --- Services section ---
  servicesSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  servicesSectionHeader: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },

  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },

  serviceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  serviceInfo: {
    flex: 1,
  },

  serviceName: {
    ...Typography.captionSemiBold,
    color: Colors.text,
  },

  serviceDuration: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 1,
  },

  servicePrice: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
    marginLeft: 8,
  },

  serviceDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginLeft: 48,
  },

  // --- Notes ---
  notesWrap: {
    gap: 8,
  },

  notesLabel: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
  },

  // --- Total bar ---
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primaryMuted,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  totalLabel: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },

  totalDuration: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  totalAmount: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 24,
    lineHeight: 28,
    color: Colors.primary,
  },
});
