import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';

const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`;
}

interface ProfileAboutProps {
  bio: string | null;
  memberSince: string;
  barberInfo?: {
    salonName: string;
    salonAddress: string | null;
    salonPhone: string | null;
  } | null;
  services?: {
    id: string;
    name: string;
    price_cents: number;
    duration_min: number;
    currency: string;
  }[];
  formatPrice: (cents: number, currency: string) => string;
}

export default function ProfileAbout({
  bio,
  memberSince,
  barberInfo,
  services,
  formatPrice,
}: ProfileAboutProps) {
  const hasServices = (services?.length ?? 0) > 0;

  return (
    <View style={styles.container}>
      {/* Bio */}
      <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.card}>
        <Text style={styles.cardTitle}>Biografie</Text>
        <Text style={styles.bioText}>
          {bio?.trim() ? bio : 'Nicio biografie adaugata.'}
        </Text>
      </Animated.View>

      {/* Salon */}
      {barberInfo && (
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.card}>
          <Text style={styles.cardTitle}>Salon</Text>
          <Text style={styles.salonName}>{barberInfo.salonName}</Text>
          {barberInfo.salonAddress && (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={15} color={Colors.textSecondary} style={styles.icon} />
              <Text style={styles.rowText}>{barberInfo.salonAddress}</Text>
            </View>
          )}
          {barberInfo.salonPhone && (
            <Pressable
              style={styles.row}
              onPress={() => Linking.openURL(`tel:${barberInfo.salonPhone}`)}
            >
              <Ionicons name="call-outline" size={15} color={Colors.primary} style={styles.icon} />
              <Text style={[styles.rowText, styles.phoneText]}>{barberInfo.salonPhone}</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {/* Services */}
      {hasServices && (
        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.card}>
          <Text style={styles.cardTitle}>Servicii</Text>
          {services!.map((s, i) => (
            <View
              key={s.id}
              style={[styles.serviceRow, i < services!.length - 1 && styles.serviceDivider]}
            >
              <View style={styles.serviceLeft}>
                <Text style={styles.serviceName}>{s.name}</Text>
                <Text style={styles.serviceDuration}>{s.duration_min} min</Text>
              </View>
              <Text style={styles.servicePrice}>
                {formatPrice(s.price_cents, s.currency)}
              </Text>
            </View>
          ))}
        </Animated.View>
      )}

      {/* Info */}
      <Animated.View entering={FadeInDown.delay(180).springify()} style={styles.card}>
        <Text style={styles.cardTitle}>Informatii</Text>
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={15} color={Colors.textSecondary} style={styles.icon} />
          <Text style={styles.rowText}>Membru din {formatMemberSince(memberSince)}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: Colors.white,
    ...Bubble.radii,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.separator,
    padding: 16,
  },
  cardTitle: {
    ...Typography.captionSemiBold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  bioText: {
    ...Typography.body,
    color: Colors.text,
    lineHeight: 22,
  },
  salonName: {
    ...Typography.bodySemiBold,
    color: Colors.text,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  icon: {
    marginRight: 6,
  },
  rowText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  phoneText: {
    color: Colors.primary,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  serviceDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  serviceLeft: {
    flex: 1,
    marginRight: 12,
  },
  serviceName: {
    ...Typography.captionSemiBold,
    color: Colors.text,
  },
  serviceDuration: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  servicePrice: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
  },
});
