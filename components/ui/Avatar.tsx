import { View, Image, Text, Pressable, ImageSourcePropType } from "react-native";
import { cn, getInitials } from "@/lib/utils";

// Default profile image
export const DEFAULT_AVATAR = require("@/assets/fondatorul-barber-store-romania-cristi-bostan-doreste-sa-dezvolte-piata-de-coafor-si-barbering-.jpg");

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

const sizes = {
  xs: { container: "w-8 h-8", text: "text-xs" },
  sm: { container: "w-10 h-10", text: "text-sm" },
  md: { container: "w-14 h-14", text: "text-base" },
  lg: { container: "w-20 h-20", text: "text-xl" },
  xl: { container: "w-28 h-28", text: "text-2xl" },
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

  // Determine the image source
  const getImageSource = () => {
    if (source) {
      // If source is a string (URL), wrap it in an object
      if (typeof source === "string") {
        return { uri: source };
      }
      // Otherwise it's already an ImageSourcePropType (require())
      return source;
    }
    // Use default avatar if enabled
    if (useDefaultAvatar) {
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
          className={cn(
            sizeStyles.container,
            "rounded-full bg-dark-300"
          )}
        />
      ) : (
        <View
          className={cn(
            sizeStyles.container,
            "rounded-full bg-primary-600 items-center justify-center"
          )}
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
