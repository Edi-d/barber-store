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
    default: "bg-dark-100 border border-dark-300",
    primary: "bg-primary-500",
    success: "bg-green-600",
    warning: "bg-amber-500",
    danger: "bg-red-600",
    live: "bg-red-600",
  };

  const textVariants = {
    default: "text-dark-700",
    primary: "text-white",
    success: "text-white",
    warning: "text-white",
    danger: "text-white",
    live: "text-white",
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
      <Text className={cn("font-semibold", textVariants[variant], textSizes[size])}>
        {children}
      </Text>
    </View>
  );
}
