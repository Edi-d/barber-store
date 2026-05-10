/**
 * lib/web-styles.ts — Web-only style utilities for NativeWind / react-native-web.
 *
 * All strings are plain Tailwind className fragments.
 * On native (iOS/Android) they resolve to empty strings and are no-ops.
 * Consumers spread these into their `className` props:
 *
 *   <Pressable className={`px-4 py-2 ${tappableWeb}`}>…</Pressable>
 *
 * Actual wiring to consumers is done in a follow-up pass.
 */

import { Platform } from 'react-native';

/**
 * Adds pointer cursor, hover opacity fade, and active press opacity to any
 * Pressable or TouchableOpacity on web. No-op on native.
 */
export const tappableWeb = Platform.OS === 'web'
  ? 'cursor-pointer hover:opacity-90 active:opacity-75 transition-opacity'
  : '';

/**
 * Constrains the root View of a tab screen to a mobile-width column on wide
 * desktop viewports, centred horizontally. Safe to use on all platforms —
 * max-w-[480px] is ignored when the viewport is already narrower.
 */
export const desktopMaxWidthWrapper = 'mx-auto w-full max-w-[480px]';

/**
 * Adds a visible focus ring on keyboard navigation for accessibility on web.
 * No-op on native (focus-visible is a web-only pseudo-class).
 */
export const focusRingWeb = Platform.OS === 'web'
  ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
  : '';
