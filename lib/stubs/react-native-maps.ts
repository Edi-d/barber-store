// Web stub for react-native-maps.
// Metro's web bundler is redirected here via metro.config.js resolveRequest.
// iOS/Android continue to resolve the real package normally — this file is never
// loaded on native platforms.

import React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

// Passthrough View component used for every map primitive on web.
function PassthroughView(props: ViewProps & { children?: React.ReactNode }) {
  return React.createElement(View, props, props.children);
}

// Default export — MapView replacement.
export default PassthroughView;

// Named map component exports.
export const Marker = PassthroughView;
export const Callout = PassthroughView;
export const Polyline = PassthroughView;
export const Polygon = PassthroughView;
export const Circle = PassthroughView;
export const Heatmap = PassthroughView;
export const Overlay = PassthroughView;
export const LocalTile = PassthroughView;
export const UrlTile = PassthroughView;
export const WMSTile = PassthroughView;
export const Geojson = PassthroughView;

// Provider constants.
export const PROVIDER_GOOGLE = null;
export const PROVIDER_DEFAULT = null;

// Commonly referenced map types / enums — safe string/object no-ops.
export const MAP_TYPES = {
  STANDARD: 'standard',
  SATELLITE: 'satellite',
  HYBRID: 'hybrid',
  TERRAIN: 'terrain',
  NONE: 'none',
  MUTEDSTANDARD: 'mutedStandard',
} as const;

// AnimatedRegion stub — consumers call methods that are no-ops on web.
export class AnimatedRegion {
  latitude = 0;
  longitude = 0;
  latitudeDelta = 0;
  longitudeDelta = 0;
  constructor(_region?: object) {}
  timing(_args?: object) { return { start: (_cb?: () => void) => {} }; }
  spring(_args?: object) { return { start: (_cb?: () => void) => {} }; }
}
