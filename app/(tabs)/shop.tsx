// The marketplace is temporarily disabled. The Shop tab stays in the bottom
// navbar but renders this "Coming Soon" placeholder instead of the marketplace
// home. To re-enable the shop, restore the original re-export:
//   export { default } from '../marketplace/index';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

export default function ShopComingSoon() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.content}>
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Ionicons name="bag-handle" size={48} color={Colors.white} />
        </LinearGradient>

        <Text style={styles.title}>Magazinul vine în curând</Text>
        <Text style={styles.subtitle}>
          Lucrăm la magazinul Tapzi. Vei putea cumpăra produsele preferate
          direct din aplicație foarte curând.
        </Text>

        <View style={styles.badge}>
          <Ionicons name="time-outline" size={16} color={Colors.primary} />
          <Text style={styles.badgeText}>În curând</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(10,102,194,0.1)',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    marginTop: Spacing.xl,
  },
  badgeText: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
  },
});
