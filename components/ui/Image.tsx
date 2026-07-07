import { Image as ExpoImage } from "expo-image";
import { cssInterop } from "nativewind";

// expo-image gives us memory + disk caching and faster native decode than
// React Native's built-in Image (a big win on Android, where RN Image has
// weak memory management). NativeWind doesn't auto-wire `className` onto
// third-party components, so register it once here — every call site can keep
// using `className` exactly as it did with the RN Image.
cssInterop(ExpoImage, { className: "style" });

// Drop-in replacement for react-native's Image. Note the prop rename at call
// sites: `resizeMode` → `contentFit` (same values: cover/contain/fill).
export const Image = ExpoImage;
export default ExpoImage;
