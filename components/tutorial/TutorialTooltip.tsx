/**
 * TutorialTooltip
 *
 * Tooltip card rendered inside TutorialOverlay during tutorial walkthroughs.
 * Positioned above or below the spotlight cutout based on the `position` prop,
 * with horizontal margins of 16px on both sides.
 *
 * Design:
 *   - Solid white background (#FFFFFF)
 *   - 1px border rgba(0,0,0,0.08)
 *   - Squircle shape: borderTopLeftRadius 25, borderTopRightRadius 12,
 *     borderBottomRightRadius 25, borderBottomLeftRadius 25
 *   - Shadows.md drop shadow
 *   - Progress dots (left) + navigation buttons (right)
 *
 * Interaction:
 *   - All Pressables use className="active:opacity-70" — NO function-style prop
 *   - NO animation on mount — tooltip appears instantly
 */

import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TutorialTooltipProps {
  title: string;
  description: string;
  position: 'top' | 'bottom';
  spotlightBounds: { x: number; y: number; width: number; height: number };
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  isLastStep: boolean;
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < current && styles.dotCompleted,
            i === current && styles.dotCurrent,
            i > current && styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TOOLTIP_GAP = 16;
const TOOLTIP_HEIGHT = 140;

export function TutorialTooltip({
  title,
  description,
  position,
  spotlightBounds,
  stepIndex,
  totalSteps,
  onNext,
  onSkip,
  isLastStep,
}: TutorialTooltipProps) {
  const { height: screenHeight } = useWindowDimensions();

  // Vertical positioning: below or above the spotlight, with overflow guard
  let top: number;
  if (position === 'bottom') {
    top = spotlightBounds.y + spotlightBounds.height + TOOLTIP_GAP;
    if (top + TOOLTIP_HEIGHT > screenHeight - 16) {
      top = spotlightBounds.y - TOOLTIP_HEIGHT - TOOLTIP_GAP;
    }
  } else {
    top = spotlightBounds.y - TOOLTIP_HEIGHT - TOOLTIP_GAP;
    if (top < 16) {
      top = spotlightBounds.y + spotlightBounds.height + TOOLTIP_GAP;
    }
  }

  return (
    <View style={[styles.shadowWrapper, { top }]}>
      <View style={styles.container}>
        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Description */}
        <Text style={styles.description}>{description}</Text>

        {/* Bottom row: dots + buttons */}
        <View style={styles.bottomRow}>
          {/* Progress dots */}
          <ProgressDots total={totalSteps} current={stepIndex} />

          {/* Navigation buttons */}
          <View style={styles.buttonsRow}>
            {/* Skip — text-only, className handles press feedback */}
            <Pressable onPress={onSkip} hitSlop={12} className="active:opacity-50">
              <Text style={styles.skipText}>Sari peste</Text>
            </Pressable>

            {/* Next / Done — squircle pill button */}
            <Pressable onPress={onNext} className="active:opacity-70">
              <View style={styles.nextButton}>
                {isLastStep ? (
                  <>
                    <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                    <Text style={styles.nextText}>Gata!</Text>
                  </>
                ) : (
                  <Text style={styles.nextText}>Urmatorul</Text>
                )}
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Shadow wrapper: carries the drop shadow and absolute positioning.
  // Must be separate from the clipping container because iOS cannot render
  // shadows on views that have overflow: 'hidden'.
  shadowWrapper: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    // Explicit Shadows.md values (iOS)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    // Android equivalent
    elevation: 3,
    // Squircle radii — explicit values so shadow wrapper matches container shape
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
  },

  container: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    // Squircle radii — explicit values (not spread) per spec
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    overflow: 'hidden',
    padding: Spacing.base,
  },

  title: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: '#1E293B',
  },

  description: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    marginTop: 4,
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.base,
  },

  // ── Progress dots ──────────────────────────────────────────────────────────

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Completed steps: filled with primary at reduced opacity to signal done
  dotCompleted: {
    backgroundColor: Colors.primary,
    opacity: 0.4,
  },

  dotInactive: {
    backgroundColor: '#CBD5E1',
  },

  // Current step dot: scale 1.3 via transform, full primary color
  dotCurrent: {
    backgroundColor: Colors.primary,
    transform: [{ scale: 1.3 }],
  },

  // ── Buttons ────────────────────────────────────────────────────────────────

  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  skipText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: '#94A3B8',
  },

  // Squircle shape for next button: 14/6/14/14
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
  },

  nextText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
});
