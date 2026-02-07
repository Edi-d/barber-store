import { View, Text } from "react-native";
import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "live";
  size?: "sm" | "md";
  className?: string;
}

export function Badge({
  children,
  variant = "default",
  size = "md",
  className,
}: BadgeProps) {
  const variants = {
    default: "bg-dark-300",
    primary: "bg-primary-600",
    success: "bg-green-600",
    warning: "bg-yellow-600",
    danger: "bg-red-600",
    live: "bg-red-600",
  };

  const sizes = {
    sm: "px-2 py-0.5",
    md: "px-3 py-1",
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
  };

  return (
    <View
      className={cn(
        "rounded-full flex-row items-center",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {variant === "live" && (
        <View className="w-2 h-2 rounded-full bg-white mr-1.5 animate-pulse" />
      )}
      <Text className={cn("text-white font-semibold", textSizes[size])}>
        {children}
      </Text>
    </View>
  );
}
