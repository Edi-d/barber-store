// ─── Global default font (Euclid Circular A) ─────────────────────────────
// React Native does NOT apply a loaded custom font to <Text>/<TextInput>
// unless every instance sets `fontFamily` explicitly. Across this app the
// large majority of <Text> nodes rely on default styling, so without this
// they silently fall back to the platform system font.
//
// On RN 0.81 / React 19 the two classic tricks are both dead ends:
//   • `Text.defaultProps` — React 19 no longer applies defaultProps to
//     function components (Text is one).
//   • patching `Text.render` — the component is a plain function, there is
//     no `.render` to wrap.
//
// So instead we redefine the `Text` / `TextInput` getters on the
// `react-native` module namespace (they are configurable accessors) to
// return a thin wrapper component. The wrapper injects the correct Euclid
// Circular A variant — derived from `fontWeight` / `fontStyle` — for any
// node that does NOT already declare a `fontFamily`. Nodes with an explicit
// `fontFamily` (icon fonts, intentionally-styled text) pass through
// untouched. Custom TTF families don't respond to numeric `fontWeight`, so
// mapping the weight to the matching file is what keeps bold text bold.

import React from 'react';
import { StyleSheet } from 'react-native';

// Must be the CommonJS singleton (not `import * as`), because Babel's wildcard
// interop can hand back a COPY of the namespace for a CJS module like
// react-native — mutating a copy would not reach `import { Text }` consumers,
// which read this exact object. `require` returns the shared module.exports.
const ReactNative: any = require('react-native');

type WeightLike = string | number | undefined;

function pickEuclid(weight: WeightLike, italic: boolean): string {
  const w = typeof weight === 'string' ? weight : String(weight ?? '');
  let base: string;
  if (w === 'bold' || w === '700' || w === '800' || w === '900') {
    base = 'Bold';
  } else if (w === '600') {
    base = 'SemiBold';
  } else if (w === '500') {
    base = 'Medium';
  } else if (w === '100' || w === '200' || w === '300') {
    base = 'Light';
  } else {
    base = 'Regular';
  }

  if (!italic) return `EuclidCircularA-${base}`;
  // Italic file names: Regular → Italic, weighted → <Weight>Italic
  return base === 'Regular'
    ? 'EuclidCircularA-Italic'
    : `EuclidCircularA-${base}Italic`;
}

/**
 * Returns the default `{ fontFamily }` to inject, or `null` when the node
 * already sets its own fontFamily (in which case we leave it alone).
 */
function defaultFontStyle(incomingStyle: unknown): { fontFamily: string } | null {
  const flat = StyleSheet.flatten(incomingStyle as any) || {};
  if (flat.fontFamily) return null;
  const italic = flat.fontStyle === 'italic';
  return { fontFamily: pickEuclid(flat.fontWeight, italic) };
}

function makeFontWrapper(Original: any) {
  // forwardRef so refs pass straight through to the underlying Text/TextInput.
  // This matters for react-native-reanimated: its Animated.Text wraps our Text
  // via createAnimatedComponent and attaches a ref to read the native handle
  // (setNativeProps / viewTag). A plain function wrapper could swallow that ref.
  const Wrapped = React.forwardRef((props: any, ref: any) => {
    const injected = defaultFontStyle(props?.style);
    const finalProps = injected
      ? { ...props, style: [injected, props.style] } // prepend → explicit styles still win
      : props;
    return React.createElement(Original, { ...finalProps, ref });
  });
  Wrapped.displayName = `Euclid(${Original?.displayName || Original?.name || 'Text'})`;
  return Wrapped;
}

let installed = false;

/**
 * Install the global Euclid Circular A default for every <Text>/<TextInput>
 * that doesn't set its own fontFamily. Idempotent.
 *
 * This MUST run during the import phase (as a side effect of importing this
 * module), before `react-native-reanimated` is evaluated: reanimated builds
 * its `Animated.Text` via `createAnimatedComponent(Text)`, reading
 * `react-native`'s `Text` getter at *its* module-eval time. If we've already
 * redefined that getter, `Animated.Text` transparently wraps our font-aware
 * Text too. That's why `app/_layout.tsx` imports this module FIRST — a
 * function *called* from the module body would run after all imports (too
 * late for reanimated). The reanimated `Animated` namespace itself is frozen
 * and cannot be patched directly, so ordering is the only lever.
 */
export function setupDefaultFont() {
  if (installed) return;
  installed = true;

  for (const key of ['Text', 'TextInput'] as const) {
    try {
      const Original = ReactNative[key];
      const Wrapped = makeFontWrapper(Original);
      Object.defineProperty(ReactNative, key, {
        configurable: true,
        enumerable: true,
        get: () => Wrapped,
      });
    } catch (err) {
      if (__DEV__) {
        console.warn(`[Fonts] Could not install default font for ${key}:`, err);
      }
    }
  }
}

// Run immediately on import — see the ordering note above.
setupDefaultFont();
