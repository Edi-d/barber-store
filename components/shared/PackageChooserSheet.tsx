// components/shared/PackageChooserSheet.tsx
//
// Bottom sheet where the client picks a "pachet recurent" (recurring package)
// for a service during booking. Mirrors components/discover/FiltersSheet.tsx:
// @gorhom/bottom-sheet, imperative open()/close(), Bubble.sheetRadii, gradient
// confirm footer, tab bar hidden while open. Opened per-service from step 2.
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, Pressable, StyleSheet, BackHandler, Platform } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useUIStore } from '@/stores/uiStore';
import { Colors, FontFamily, Bubble } from '@/constants/theme';
import type { BarberService, ServiceRecurringPackage } from '@/types/database';
import { packageTitle, packageSubtitle } from '@/lib/recurring-package';

export interface PackageChooserSheetHandle {
  /** Open the sheet for a service, optionally preselecting a package. */
  open: (
    service: BarberService,
    packages: ServiceRecurringPackage[],
    selectedId?: string | null,
  ) => void;
  close: () => void;
}

interface Props {
  onSelect: (service: BarberService, pkg: ServiceRecurringPackage) => void;
  /** Called when the user chooses "Fără pachet" to remove an active package. */
  onClear?: () => void;
  formatPrice: (cents: number, currency: string) => string;
}

export const PackageChooserSheet = forwardRef<PackageChooserSheetHandle, Props>(
  function PackageChooserSheet({ onSelect, onClear, formatPrice }, ref) {
    const sheetRef = useRef<BottomSheet>(null);
    const isOpenRef = useRef(false);
    const setTabBarHidden = useUIStore((s) => s.setTabBarHidden);

    const [service, setService] = useState<BarberService | null>(null);
    const [packages, setPackages] = useState<ServiceRecurringPackage[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hadActive, setHadActive] = useState(false);

    useImperativeHandle(
      ref,
      () => ({
        open: (svc, pkgs, preselect) => {
          setService(svc);
          setPackages(pkgs);
          setSelectedId(preselect ?? null);
          setHadActive(!!preselect);
          setTabBarHidden(true);
          isOpenRef.current = true;
          sheetRef.current?.expand();
        },
        close: () => sheetRef.current?.close(),
      }),
      [setTabBarHidden],
    );

    const handleSheetChange = useCallback(
      (index: number) => {
        isOpenRef.current = index >= 0;
        if (index < 0) setTabBarHidden(false);
      },
      [setTabBarHidden],
    );

    // Android hardware back closes the sheet instead of popping the navigator.
    useEffect(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isOpenRef.current) {
          sheetRef.current?.close();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, []);

    useEffect(() => () => setTabBarHidden(false), [setTabBarHidden]);

    const snapPoints = useMemo(() => ['70%'], []);

    const renderBackdrop = useCallback(
      (p: React.ComponentProps<typeof BottomSheetBackdrop>) => (
        <BottomSheetBackdrop
          {...p}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      ),
      [],
    );

    const handleConfirm = useCallback(() => {
      const pkg = packages.find((p) => p.id === selectedId);
      if (!service || !pkg) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSelect(service, pkg);
      sheetRef.current?.close();
    }, [packages, selectedId, service, onSelect]);

    const handleClear = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClear?.();
      sheetRef.current?.close();
    }, [onClear]);

    const currency = service?.currency ?? 'RON';

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.sheetBg}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Pachete recurente</Text>
            {service ? <Text style={styles.subtitle}>pentru {service.name}</Text> : null}
          </View>
          {hadActive && onClear ? (
            <Pressable onPress={handleClear} hitSlop={8}>
              {({ pressed }) => (
                <Text style={[styles.clearText, { opacity: pressed ? 0.6 : 1 }]}>Fără pachet</Text>
              )}
            </Pressable>
          ) : null}
        </View>

        <BottomSheetScrollView contentContainerStyle={styles.body}>
          <Text style={styles.blurb}>
            Plătești o singură dată și programările se repetă automat la același interval, cu același
            specialist.
          </Text>

          {packages.map((pkg) => {
            const selected = pkg.id === selectedId;
            return (
              <Pressable
                key={pkg.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedId(pkg.id);
                }}
                style={[styles.row, selected && styles.rowSelected]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{packageTitle(pkg)}</Text>
                  <Text style={styles.rowSub}>{packageSubtitle(pkg)}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowPrice, selected && styles.rowPriceSelected]}>
                    {formatPrice(pkg.price_cents, currency)}
                  </Text>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? Colors.primary : '#CBD5E1'}
                  />
                </View>
              </Pressable>
            );
          })}
        </BottomSheetScrollView>

        <View style={styles.footer}>
          <Pressable onPress={handleConfirm} disabled={!selectedId}>
            {({ pressed }) => (
              <View style={[styles.ctaShadow, pressed && styles.ctaPressed]}>
                <LinearGradient
                  colors={
                    !selectedId
                      ? ['#cbd5e1', '#94a3b8']
                      : [Colors.gradientStart, Colors.primary, Colors.gradientEnd]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>Alege pachetul</Text>
                  {selectedId ? (
                    <View style={styles.ctaArrow}>
                      <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                    </View>
                  ) : null}
                </LinearGradient>
              </View>
            )}
          </Pressable>
        </View>
      </BottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: Colors.white,
    ...Bubble.sheetRadii,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
  },
  handle: {
    backgroundColor: 'rgba(15,23,42,0.15)',
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  clearText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.error,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  blurb: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    ...Bubble.radii,
  },
  rowSelected: {
    borderColor: Colors.gradientStart,
    backgroundColor: '#EFF6FF',
  },
  rowTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.text,
  },
  rowSub: {
    fontFamily: FontFamily.regular,
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rowPrice: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    color: Colors.text,
  },
  rowPriceSelected: {
    color: Colors.primary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    backgroundColor: Colors.white,
  },
  ctaShadow: {
    ...Bubble.radiiSm,
    shadowColor: Colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cta: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  ctaPressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.18,
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.white,
    letterSpacing: 0.2,
  },
  ctaArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
