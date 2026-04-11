import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  Dimensions,
  StyleSheet,
  FlatList,
  ScrollView,
  Share,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

import {
  HairstylePrompt,
  getHairstylesByGender,
  getCategories,
} from "@/data/hairstylePrompts";
import { useHairstyleTryon } from "@/hooks/useHairstyleTryon";
import BeforeAfterSlider from "@/components/tryon/BeforeAfterSlider";
import { TryOnConsentModal } from "@/components/tryon/TryOnConsentModal";
import { Button } from "@/components/ui/Button";
import {
  Colors,
  Brand,
  Typography,
  Bubble,
  Shadows,
  Spacing,
  Radius,
} from "@/constants/theme";

// ── Category icon mapping ──────────────────────────────────────────────────────

const CATEGORY_ICON = 'cut-outline';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONSENT_KEY = "tryon_consent_accepted";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_GAP = 10;
const CARD_H_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_H_PADDING * 2 - CARD_GAP) / 2;
const CARD_HEIGHT = 60;

// ── Step type ──────────────────────────────────────────────────────────────────

type TryOnStep = "select-style" | "capture" | "generating" | "result";

// ── Sub-components ─────────────────────────────────────────────────────────────

function PulseDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    const timer = setTimeout(() => {
      opacity.value = withRepeat(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimation(opacity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.pulseDot, animStyle]} />;
}

interface ErrorOverlayProps {
  message: string;
  onRetry: () => void;
}

function ErrorOverlay({ message, onRetry }: ErrorOverlayProps) {
  return (
    <View style={styles.errorOverlay}>
      <View style={styles.errorCard}>
        <View style={styles.errorIconWrap}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.error} />
        </View>
        <Text style={styles.errorTitle}>Ceva n-a mers bine</Text>
        <Text style={styles.errorMessage}>{message}</Text>
        <Button variant="primary" onPress={onRetry} style={styles.errorBtn}>
          Încearcă Din Nou
        </Button>
      </View>
    </View>
  );
}

interface StyleCardProps {
  item: HairstylePrompt;
  index: number;
  selected: boolean;
  onPress: (item: HairstylePrompt) => void;
}

const StyleCard = React.memo(function StyleCard({ item, index, selected, onPress }: StyleCardProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.98, { duration: 80 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: 100 });
  }, [scale]);

  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index * 20, 200)).duration(250)}
      style={animStyle}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.styleCard, selected && styles.styleCardSelected]}
      >
        <Text
          style={[styles.styleCardName, selected && styles.styleCardNameSelected]}
          numberOfLines={2}
        >
          {item.nameRo}
        </Text>
        {selected && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={11} color={Colors.white} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

// ── Main screen ────────────────────────────────────────────────────────────────

export default function TryOnScreen() {
  const insets = useSafeAreaInsets();

  const { salonType, salonId } = useLocalSearchParams<{
    salonType?: string;
    salonId?: string;
  }>();
  const gender: "male" | "female" = salonType === "coafor" ? "female" : "male";

  // Step state
  const [step, setStep] = useState<TryOnStep>("select-style");

  // Style selection state
  const [selectedStyle, setSelectedStyle] = useState<HairstylePrompt | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Hook
  const {
    selfieUri,
    resultImageUri,
    isGenerating,
    error,
    pickSelfie,
    pickFromGallery,
    generatePreview,
    retake,
  } = useHairstyleTryon();

  // Consent state
  const [showConsent, setShowConsent] = useState(false);
  const pendingAction = useRef<"camera" | "gallery" | null>(null);

  // Guard to avoid double-triggering generation
  const hasAutoGenerated = useRef(false);

  // Derived data
  const allStyles = getHairstylesByGender(gender);
  const categories = getCategories(gender);
  const filteredStyles =
    activeCategory === null
      ? allStyles
      : allStyles.filter((s) => s.category === activeCategory);

  // ── Consent setup ────────────────────────────────────────────────────────────

  const handleConsentDecline = useCallback(() => {
    setShowConsent(false);
    pendingAction.current = null;
  }, []);

  // ── Loading phase messages (generating step) ──────────────────────────────────

  const [loadingPhase, setLoadingPhase] = useState(0);

  const LOADING_MESSAGES = selectedStyle
    ? [
        "Analizăm trăsăturile tale...",
        `Aplicăm stilul ${selectedStyle.nameRo}...`,
        "Ultimele retușuri magice...",
      ]
    : [
        "Analizăm trăsăturile tale...",
        "Aplicăm stilul ales...",
        "Ultimele retușuri magice...",
      ];

  useEffect(() => {
    if (!isGenerating) {
      setLoadingPhase(0);
      return;
    }
    setLoadingPhase(0);
    const t1 = setTimeout(() => setLoadingPhase(1), 4000);
    const t2 = setTimeout(() => setLoadingPhase(2), 12000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isGenerating]);

  // ── Overlay pulse animation (generating step) ─────────────────────────────────

  const overlayOpacity = useSharedValue(0.45);

  useEffect(() => {
    if (isGenerating) {
      overlayOpacity.value = withRepeat(
        withTiming(0.72, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(overlayOpacity);
      overlayOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isGenerating, overlayOpacity]);

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  // ── Sync hook state → step ───────────────────────────────────────────────────

  useEffect(() => {
    if (isGenerating && step !== "generating") {
      setStep("generating");
    }
    if (!isGenerating && resultImageUri && step !== "result") {
      setStep("result");
      hasAutoGenerated.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, resultImageUri]);

  // ── Auto-generate when step becomes "generating" and selfie is ready ────────

  useEffect(() => {
    if (step === "generating" && selfieUri && selectedStyle && !isGenerating && !resultImageUri) {
      generatePreview(selectedStyle.nameRo, selectedStyle.prompt);
    }
  }, [step, selfieUri, selectedStyle, isGenerating, resultImageUri, generatePreview]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const triggerGenerate = useCallback(
    (style: HairstylePrompt) => {
      generatePreview(style.nameRo, style.prompt);
    },
    [generatePreview]
  );

  const handleSelectStyle = useCallback((item: HairstylePrompt) => {
    setSelectedStyle(item);
    Haptics.selectionAsync();
  }, []);

  const handleCategoryPress = useCallback((cat: string | null) => {
    setActiveCategory(cat);
    Haptics.selectionAsync();
  }, []);

  const handleContinue = useCallback(() => {
    if (!selectedStyle) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (selfieUri) {
      // Already have a selfie — go straight to generating with new style
      hasAutoGenerated.current = false;
      triggerGenerate(selectedStyle);
    } else {
      setStep("capture");
    }
  }, [selectedStyle, selfieUri, triggerGenerate]);

  const handleOpenCamera = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const consent = await AsyncStorage.getItem(CONSENT_KEY);
    if (consent === "true") {
      const success = await pickSelfie();
      if (success) {
        setStep("generating");
      }
    } else {
      pendingAction.current = "camera";
      setShowConsent(true);
    }
  }, [pickSelfie]);

  const handlePickFromGallery = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const consent = await AsyncStorage.getItem(CONSENT_KEY);
    if (consent === "true") {
      const success = await pickFromGallery();
      if (success) {
        setStep("generating");
      }
    } else {
      pendingAction.current = "gallery";
      setShowConsent(true);
    }
  }, [pickFromGallery]);

  const handleConsentAcceptWithAction = useCallback(async () => {
    await AsyncStorage.setItem(CONSENT_KEY, "true");
    setShowConsent(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    let success = false;
    if (action === "camera") success = await pickSelfie();
    else if (action === "gallery") success = await pickFromGallery();
    if (success) {
      setStep("generating");
    }
  }, [pickSelfie, pickFromGallery]);

  const handleRetryGenerate = useCallback(() => {
    if (!selectedStyle) return;
    hasAutoGenerated.current = false;
    triggerGenerate(selectedStyle);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [selectedStyle, triggerGenerate]);

  const handleCancelGenerate = useCallback(() => {
    retake();
    setStep("capture");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [retake]);

  const handleAltStil = useCallback(() => {
    // Keep selfieUri but clear selected style so user must pick a new one
    setSelectedStyle(null);
    setStep("select-style");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleRetakePhoto = useCallback(() => {
    retake();
    hasAutoGenerated.current = false;
    setStep("capture");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [retake]);

  const handleSaveImage = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // expo-media-library integration can be wired here when needed
  }, []);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: selectedStyle
          ? `Am probat stilul ${selectedStyle.nameRo} cu AI!`
          : "Am probat un stil nou cu AI!",
      });
    } catch {
      // user dismissed
    }
  }, [selectedStyle]);

  const handleBook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (salonId) {
      router.push(`/book-appointment?salonId=${salonId}`);
    } else {
      router.push("/(tabs)/discover");
    }
  }, [salonId]);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  // ── STEP: select-style ────────────────────────────────────────────────────────

  if (step === "select-style") {
    const hasSelfie = !!selfieUri;
    const ctaLabel = hasSelfie ? "Aplică Stilul" : "Continuă";
    const ctaDisabled = !selectedStyle;

    return (
      <View style={styles.rootDark}>
        <StatusBar style="light" />
        {/* Top bar */}
        <SafeAreaView edges={["top"]} style={styles.topBarSafe}>
          <View style={styles.topBar}>
            <Pressable
              onPress={handleBack}
              style={styles.topBarCircleBtn}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.white} />
            </Pressable>
            <Text style={styles.topBarTitle}>Alege Stilul</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>

        {/* Category tabs */}
        <View style={styles.tabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {/* "Toate" tab */}
            <Pressable
              onPress={() => handleCategoryPress(null)}
              style={styles.tabPressable}
            >
              {activeCategory === null ? (
                <LinearGradient
                  colors={[Brand.gradientStart, Brand.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tabPill, styles.tabPillActive]}
                >
                  <Ionicons name={CATEGORY_ICON as any} size={14} color={Colors.white} style={styles.tabIcon} />
                  <Text style={styles.tabTextActive}>Toate</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.tabPill, styles.tabPillInactive]}>
                  <Ionicons name={CATEGORY_ICON as any} size={14} color="rgba(255,255,255,0.5)" style={styles.tabIcon} />
                  <Text style={styles.tabTextInactive}>Toate</Text>
                </View>
              )}
            </Pressable>

            {categories.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => handleCategoryPress(cat)}
                style={styles.tabPressable}
              >
                {activeCategory === cat ? (
                  <LinearGradient
                    colors={[Brand.gradientStart, Brand.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.tabPill, styles.tabPillActive]}
                  >
                    <Ionicons
                      name={CATEGORY_ICON as any}
                      size={14}
                      color={Colors.white}
                      style={styles.tabIcon}
                    />
                    <Text style={styles.tabTextActive}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.tabPill, styles.tabPillInactive]}>
                    <Ionicons
                      name={CATEGORY_ICON as any}
                      size={14}
                      color="rgba(255,255,255,0.5)"
                      style={styles.tabIcon}
                    />
                    <Text style={styles.tabTextInactive}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Grid */}
        <FlatList<HairstylePrompt>
          data={filteredStyles}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={[
            styles.gridContent,
            { paddingBottom: 120 + insets.bottom },
          ]}
          columnWrapperStyle={styles.gridColumnWrapper}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.emptyStateWrap}>
              <Ionicons name="cut-outline" size={40} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyStateText}>
                Niciun stil în această categorie
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <StyleCard
              item={item}
              index={index}
              selected={selectedStyle?.id === item.id}
              onPress={handleSelectStyle}
            />
          )}
        />

        {/* Bottom CTA */}
        <View
          style={[
            styles.selectStyleCta,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
          pointerEvents="box-none"
        >
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.98)"]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={styles.selectStyleCtaInner}>
            <Button
              variant="primary"
              size="lg"
              onPress={handleContinue}
              disabled={ctaDisabled}
              style={ctaDisabled ? styles.ctaBtnDisabled : undefined}
            >
              {ctaLabel}
            </Button>
          </View>
        </View>

        {/* Error overlay */}
        {error && <ErrorOverlay message={error} onRetry={handleRetryGenerate} />}

        {/* Consent modal */}
        <TryOnConsentModal
          visible={showConsent}
          onAccept={handleConsentAcceptWithAction}
          onDecline={handleConsentDecline}
        />
      </View>
    );
  }

  // ── STEP: capture ─────────────────────────────────────────────────────────────

  if (step === "capture") {
    return (
      <View style={styles.rootDark}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <Pressable
              onPress={() => {
                setStep("select-style");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={styles.topBarCircleBtn}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.white} />
            </Pressable>
            <Text style={styles.topBarTitle}>Fă un Selfie</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Illustration area */}
          <View style={styles.captureCenter}>
            {/* Selected style badge */}
            {selectedStyle && (
              <Animated.View entering={FadeInDown.duration(320)} style={styles.selectedStyleBadgeWrap}>
                <View style={styles.selectedStyleBadge}>
                  <Ionicons
                    name={selectedStyle.icon as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={Colors.primaryLight}
                  />
                  <Text style={styles.selectedStyleBadgeText}>
                    {selectedStyle.nameRo}
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* Camera icon — squircle */}
            <Animated.View entering={FadeInDown.delay(60).duration(380)} style={styles.cameraRing}>
              <Ionicons name="camera-outline" size={48} color={Colors.primaryLight} />
              <Text style={styles.cameraHint}>Selfie</Text>
            </Animated.View>

            {/* Instructions */}
            <Animated.Text entering={FadeInDown.delay(120).duration(380)} style={styles.captureTitle}>
              {"Fă un selfie pentru a vedea\ncum arăți cu stilul "}
              <Text style={styles.captureTitleAccent}>
                {selectedStyle?.nameRo ?? "ales"}
              </Text>
            </Animated.Text>

            {/* Tips row */}
            <Animated.View entering={FadeInDown.delay(180).duration(380)} style={styles.tipsRow}>
              <View style={styles.tipPill}>
                <Ionicons name="sunny-outline" size={13} color="rgba(255,255,255,0.5)" />
                <Text style={styles.tipsText}>Lumină bună</Text>
              </View>
              <View style={styles.tipPill}>
                <Ionicons name="person-outline" size={13} color="rgba(255,255,255,0.5)" />
                <Text style={styles.tipsText}>Privește în față</Text>
              </View>
              <View style={styles.tipPill}>
                <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.5)" />
                <Text style={styles.tipsText}>Părul vizibil</Text>
              </View>
            </Animated.View>
          </View>

          {/* Bottom actions */}
          <Animated.View
            entering={FadeInUp.delay(200).duration(380)}
            style={styles.captureBottom}
          >
            <Button
              variant="primary"
              size="lg"
              onPress={handleOpenCamera}
              style={styles.fullWidthBtn}
              icon={<Ionicons name="camera" size={18} color={Colors.white} />}
            >
              Deschide Camera
            </Button>

            <Pressable
              onPress={handlePickFromGallery}
              className="active:opacity-60"
            >
              <View style={styles.textLinkWrap}>
                <Ionicons name="images-outline" size={15} color="rgba(255,255,255,0.4)" />
                <Text style={styles.textLink}>sau alege din galerie</Text>
              </View>
            </Pressable>
          </Animated.View>
        </SafeAreaView>

        {error && <ErrorOverlay message={error} onRetry={handleRetryGenerate} />}

        <TryOnConsentModal
          visible={showConsent}
          onAccept={handleConsentAcceptWithAction}
          onDecline={handleConsentDecline}
        />
      </View>
    );
  }

  // ── STEP: generating ──────────────────────────────────────────────────────────

  if (step === "generating") {
    return (
      <View style={styles.rootDark}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <Pressable
              onPress={handleCancelGenerate}
              style={styles.topBarCircleBtn}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.white} />
            </Pressable>
            <Text style={styles.topBarTitle}>Probează Stilul</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Selfie with pulse overlay */}
          <View style={styles.generatingImageWrap}>
            {selfieUri && (
              <Image
                source={{ uri: selfieUri }}
                style={styles.selfieImage}
                resizeMode="cover"
              />
            )}
            <Animated.View style={[styles.generatingOverlay, overlayAnimStyle]} />
            <View style={styles.generatingLabelWrap} pointerEvents="none">
              <Text style={styles.generatingLabel}>{LOADING_MESSAGES[loadingPhase]}</Text>
              <View style={styles.dotsRow}>
                <PulseDot delay={0} />
                <PulseDot delay={200} />
                <PulseDot delay={400} />
              </View>
            </View>
          </View>

          {/* Cancel */}
          <View style={styles.cancelWrap}>
            <Pressable onPress={handleCancelGenerate} style={styles.textLinkWrap}>
              <Text style={styles.textLink}>Anulează</Text>
            </Pressable>
          </View>
        </SafeAreaView>

        {error && <ErrorOverlay message={error} onRetry={handleRetryGenerate} />}
      </View>
    );
  }

  // ── STEP: result — full-bleed slider with overlay UI ─────────────────────────

  return (
    <View style={styles.rootDark}>
      <StatusBar style="light" />
      {/* Full-bleed before/after slider */}
      {selfieUri && resultImageUri && (
        <BeforeAfterSlider
          beforeUri={selfieUri}
          afterUri={resultImageUri}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          fullBleed
        />
      )}

      {/* Top gradient scrim */}
      <LinearGradient
        colors={["rgba(0,0,0,0.7)", "transparent"]}
        style={styles.resultTopScrim}
        pointerEvents="none"
      />

      {/* Top bar overlay */}
      <SafeAreaView edges={["top"]} style={styles.resultTopBarSafe} pointerEvents="box-none">
        <View style={styles.resultTopBar}>
          <Pressable
            onPress={handleBack}
            style={styles.glassCircleBtn}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={styles.glassCircleBtn}
            hitSlop={8}
          >
            <Ionicons name="share-outline" size={22} color={Colors.white} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Bottom gradient sheet overlay */}
      <View
        style={[
          styles.resultBottomSheet,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.92)"]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.resultBottomContent} pointerEvents="box-none">
          {/* Style badge — centered glass squircle */}
          {selectedStyle && (
            <Animated.View entering={FadeInUp.delay(80).duration(360)} style={styles.resultBadgeRow}>
              <View style={styles.resultStyleBadge}>
                <Ionicons name="cut-outline" size={13} color="rgba(255,255,255,0.9)" />
                <Text style={styles.resultStyleBadgeText}>
                  {selectedStyle.nameRo}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Primary CTA — Rezervă Stilul — full width gradient */}
          <Animated.View entering={FadeInUp.delay(120).duration(360)}>
            <Pressable onPress={handleBook} className="active:opacity-85">
              <View style={styles.resultPrimaryBtn}>
                <LinearGradient
                  colors={[Brand.gradientStart, Brand.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.resultPrimaryBtnGradient}
                >
                  <Ionicons name={salonId ? "calendar-outline" : "search-outline"} size={18} color={Colors.white} />
                  <Text style={styles.resultPrimaryBtnText}>{salonId ? "Rezervă Stilul" : "Găsește un Salon"}</Text>
                </LinearGradient>
              </View>
            </Pressable>
          </Animated.View>

          {/* Secondary — Alt Stil — glass button */}
          <Animated.View entering={FadeInUp.delay(160).duration(360)}>
            <Pressable onPress={handleAltStil} className="active:opacity-80">
              <View style={styles.resultSecondaryLink}>
                <Ionicons name="color-wand-outline" size={15} color="rgba(255,255,255,0.75)" />
                <Text style={styles.resultSecondaryLinkText}>Încearcă Alt Stil</Text>
              </View>
            </Pressable>
          </Animated.View>

        </View>
      </View>

      {/* Error overlay */}
      {error && <ErrorOverlay message={error} onRetry={handleRetryGenerate} />}

      {/* Consent modal (can surface from any step) */}
      <TryOnConsentModal
        visible={showConsent}
        onAccept={handleConsentAcceptWithAction}
        onDecline={handleConsentDecline}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Layout foundations ────────────────────────────────────────────────────────
  rootDark: {
    flex: 1,
    backgroundColor: "#000",
  },
  flex: {
    flex: 1,
  },

  // ── Top bar ───────────────────────────────────────────────────────────────────
  topBarSafe: {
    backgroundColor: "transparent",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    height: 52,
  },
  topBarCircleBtn: {
    width: 40,
    height: 40,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    ...Typography.h3,
    color: Colors.white,
    flex: 1,
    textAlign: "center",
  },

  // ── Category tabs ─────────────────────────────────────────────────────────────
  tabsWrapper: {
    height: 52,
    justifyContent: "center",
  },
  tabsContent: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    alignItems: "center",
  },
  tabPressable: {
    // touchable wrapper — no bg, measured by child
  },
  tabPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabIcon: {
    // icon sits naturally in the flex row; no extra margin needed (gap handles spacing)
  },
  tabPillActive: {
    borderColor: "rgba(68,129,235,0.45)",
  },
  tabPillInactive: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  tabTextActive: {
    ...Typography.captionSemiBold,
    color: Colors.white,
  },
  tabTextInactive: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.5)",
  },

  // ── Style grid ────────────────────────────────────────────────────────────────
  emptyStateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 64,
    gap: Spacing.md,
  },
  emptyStateText: {
    fontFamily: "EuclidCircularA-Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  gridContent: {
    paddingHorizontal: CARD_H_PADDING,
    paddingTop: Spacing.base,
    gap: CARD_GAP,
  },
  gridColumnWrapper: {
    gap: CARD_GAP,
  },
  styleCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    ...Bubble.radiiSm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  styleCardSelected: {
    backgroundColor: "rgba(68,129,235,0.18)",
    borderColor: "rgba(68,129,235,0.5)",
  },
  styleCardName: {
    ...Typography.captionSemiBold,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  styleCardNameSelected: {
    color: Colors.white,
  },
  checkBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Brand.gradientStart,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Style selection CTA ───────────────────────────────────────────────────────
  selectStyleCta: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    justifyContent: "flex-end",
  },
  selectStyleCtaInner: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  ctaBtnDisabled: {
    opacity: 0.4,
  },

  // ── Capture step ──────────────────────────────────────────────────────────────
  captureCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: 60,
  },
  selectedStyleBadgeWrap: {
    marginBottom: Spacing.xl,
  },
  selectedStyleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  selectedStyleBadgeText: {
    ...Typography.smallSemiBold,
    color: "rgba(255,255,255,0.85)",
  },
  cameraRing: {
    width: 120,
    height: 120,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 38,
    borderBottomLeftRadius: 38,
    borderWidth: 1.5,
    borderColor: "rgba(10, 133, 244, 0.3)",
    backgroundColor: "rgba(10, 133, 244, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: Spacing.lg,
  },
  cameraHint: {
    ...Typography.small,
    color: "rgba(10, 133, 244, 0.5)",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  captureTitle: {
    ...Typography.body,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginBottom: Spacing.md,
    lineHeight: 24,
  },
  captureTitleAccent: {
    ...Typography.bodySemiBold,
    color: Colors.primaryLight,
  },
  tipsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  tipPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tipsText: {
    ...Typography.small,
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
  },
  captureBottom: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  fullWidthBtn: {
    // fills container via parent padding
  },
  textLinkWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignSelf: "center",
  },
  textLink: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.4)",
  },

  // ── Generating step ───────────────────────────────────────────────────────────
  generatingImageWrap: {
    flex: 1,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    marginBottom: Spacing.base,
    ...Bubble.radiiLg,
    overflow: "hidden",
    position: "relative",
  },
  selfieImage: {
    width: "100%",
    height: "100%",
    ...Bubble.radiiLg,
  },
  generatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  generatingLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  generatingLabel: {
    ...Typography.bodySemiBold,
    color: Colors.white,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dotsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primaryLight,
  },
  cancelWrap: {
    alignItems: "center",
    paddingBottom: Spacing.lg,
  },

  // ── Result step ───────────────────────────────────────────────────────────────
  resultTopScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  resultTopBarSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  resultTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    height: 52,
  },
  glassCircleBtn: {
    width: 40,
    height: 40,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultBottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "flex-end",
  },
  resultBottomContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  resultBadgeRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  resultStyleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  resultStyleBadgeText: {
    ...Typography.captionSemiBold,
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
  },
  resultPrimaryBtn: {
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    overflow: "hidden",
  },
  resultPrimaryBtnGradient: {
    height: 52,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  resultPrimaryBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
  resultSecondaryLink: {
    height: 42,
    marginHorizontal: 40,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  resultSecondaryLinkText: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.2,
  },
  resultTertiaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  tertiaryLink: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  tertiaryLinkText: {
    ...Typography.small,
    color: "rgba(255,255,255,0.6)",
    textDecorationLine: "underline",
    textDecorationColor: "rgba(255,255,255,0.35)",
  },
  tertiarySep: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255,255,255,0.35)",
  },

  // ── Error overlay ─────────────────────────────────────────────────────────────
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  errorCard: {
    width: "100%",
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "rgba(229,57,53,0.4)",
    ...Bubble.radiiLg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    ...Shadows.lg,
  },
  errorIconWrap: {
    marginBottom: Spacing.xs,
  },
  errorTitle: {
    ...Typography.h3,
    color: Colors.white,
    textAlign: "center",
  },
  errorMessage: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: "center",
    lineHeight: 20,
  },
  errorBtn: {
    marginTop: Spacing.sm,
    alignSelf: "stretch",
  },
});
