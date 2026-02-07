import { View, Image, Text, Pressable } from "react-native";
import { cn, getInitials } from "@/lib/utils";

interface AvatarProps {
  source?: string | null;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  onPress?: () => void;
  showBadge?: boolean;
  badgeColor?: string;
  className?: string;
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
}: AvatarProps) {
  const Wrapper = onPress ? Pressable : View;
  const sizeStyles = sizes[size];

  return (
    <Wrapper onPress={onPress} className={cn("relative", className)}>
      {source ? (
        <Image
          source={{ uri: source }}
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
