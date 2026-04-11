import { View, Image, Text, Pressable, ImageSourcePropType, StyleSheet } from "react-native";
import { cn, getInitials } from "@/lib/utils";
import { AvatarSize } from "@/constants/theme";

// Generic fallback — resolves to null so the initials view is shown instead
export const DEFAULT_AVATAR = null;

interface AvatarProps {
  source?: string | null | ImageSourcePropType;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  onPress?: () => void;
  showBadge?: boolean;
  badgeColor?: string;
  className?: string;
  useDefaultAvatar?: boolean;
}

// Tailwind classes kept for backward-compat fallback; numeric sizes come from AvatarSize tokens
const sizes = {
  xs: { px: AvatarSize.xs, text: "text-xs" },
  sm: { px: AvatarSize.sm, text: "text-sm" },
  md: { px: AvatarSize.md, text: "text-base" },
  lg: { px: AvatarSize.lg, text: "text-xl" },
  xl: { px: AvatarSize.xl, text: "text-2xl" },
};

export function Avatar({
  source,
  name = "",
  size = "md",
  onPress,
  showBadge = false,
  badgeColor = "bg-green-500",
  className,
  useDefaultAvatar = false,
}: AvatarProps) {
  const Wrapper = onPress ? Pressable : View;
  const sizeStyles = sizes[size];
  const dim = sizeStyles.px;
  const radius = dim / 2;

  // Determine the image source
  const getImageSource = () => {
    if (source) {
      if (typeof source === "string") {
        return { uri: source };
      }
      return source;
    }
    if (useDefaultAvatar && DEFAULT_AVATAR) {
      return DEFAULT_AVATAR;
    }
    return null;
  };

  const imageSource = getImageSource();

  return (
    <Wrapper onPress={onPress} className={cn("relative", className)}>
      {imageSource ? (
        <Image
          source={imageSource}
          style={{ width: dim, height: dim, borderRadius: radius }}
          className="bg-dark-300"
        />
      ) : (
        <View
          style={{ width: dim, height: dim, borderRadius: radius }}
          className="bg-primary-500 items-center justify-center"
        >
          <Text className={cn("text-white font-bold", sizeStyles.text)}>
            {getInitials(name)}
          </Text>
        </View>
      )}
      {showBadge && (
        <View
          className={cn(
            "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white",
            badgeColor
          )}
        />
      )}
    </Wrapper>
  );
}
