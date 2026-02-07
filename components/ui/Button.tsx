import { Pressable, Text, ActivityIndicator, View } from "react-native";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const Button = forwardRef<View, ButtonProps>(
  (
    {
      children,
      onPress,
      variant = "primary",
      size = "md",
      disabled = false,
      loading = false,
      icon,
      className,
    },
    ref
  ) => {
    const baseStyles = "flex-row items-center justify-center rounded-xl";
    
    const variants = {
      primary: "bg-primary-600 active:bg-primary-700",
      secondary: "bg-dark-200 active:bg-dark-300",
      outline: "border-2 border-primary-600 bg-transparent active:bg-primary-50",
      ghost: "bg-transparent active:bg-dark-200",
      danger: "bg-red-600 active:bg-red-700",
    };
    
    const sizes = {
      sm: "px-4 py-2",
      md: "px-6 py-3",
      lg: "px-8 py-4",
    };
    
    const textVariants = {
      primary: "text-white font-semibold",
      secondary: "text-dark-700 font-semibold",
      outline: "text-primary-600 font-semibold",
      ghost: "text-dark-700 font-semibold",
      danger: "text-white font-semibold",
    };
    
    const textSizes = {
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
    };

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        disabled={disabled || loading}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          (disabled || loading) && "opacity-50",
          className
        )}
      >
        {loading ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <>
            {icon && <View className="mr-2">{icon}</View>}
            <Text className={cn(textVariants[variant], textSizes[size])}>
              {children}
            </Text>
          </>
        )}
      </Pressable>
    );
  }
);

Button.displayName = "Button";
