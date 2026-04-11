import {
  Pressable,
  Text,
  ActivityIndicator,
  View,
  StyleSheet,
  Platform,
} from "react-native";
import { forwardRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Typography, Bubble, Shadows } from "@/constants/theme";

interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: object;
  className?: string; // kept for backwards compat, ignored
}

const bubbleRadii = { ...Bubble.radii };

const sizeHeights = { sm: 40, md: 48, lg: 54 };
const sizePaddingH = { sm: 16, md: 24, lg: 32 };
const textSizes = { sm: 14, md: 16, lg: 16 };

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
      style: customStyle,
    },
    ref
  ) => {
    const height = sizeHeights[size];
    const paddingHorizontal = sizePaddingH[size];
    const fontSize = textSizes[size];
    const isDisabled = disabled || loading;

    // Primary variant uses gradient
    if (variant === "primary") {
      return (
        <Pressable
          ref={ref}
          onPress={onPress}
          disabled={isDisabled}
          style={({ pressed }) => [
            styles.outer,
            Shadows.glow,
            isDisabled && styles.disabled,
            pressed && styles.pressed,
            customStyle,
          ]}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradient, { height, paddingHorizontal }]}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <View style={styles.content}>
                {icon && <View style={styles.iconMargin}>{icon}</View>}
                <Text style={[styles.textPrimary, { fontSize }]}>
                  {children}
                </Text>
              </View>
            )}
          </LinearGradient>
        </Pressable>
      );
    }

    // Other variants
    const variantStyles = {
      secondary: {
        bg: Colors.inputBackground,
        bgPressed: Colors.inputBorder,
        textColor: Colors.text,
      },
      outline: {
        bg: "transparent",
        bgPressed: Colors.primaryMuted,
        textColor: Colors.gradientStart,
        borderWidth: 2,
        borderColor: Colors.gradientStart,
      },
      ghost: {
        bg: "transparent",
        bgPressed: Colors.inputBackground,
        textColor: Colors.text,
      },
      danger: {
        bg: Colors.error,
        bgPressed: Colors.errorPressed,
        textColor: Colors.white,
      },
    };

    const v = variantStyles[variant];

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.base,
          {
            height,
            paddingHorizontal,
            backgroundColor: pressed ? v.bgPressed : v.bg,
          },
          v.borderWidth
            ? { borderWidth: v.borderWidth, borderColor: v.borderColor }
            : undefined,
          variant === "danger" && {
            ...Shadows.glow,
            shadowColor: Colors.error,
          },
          isDisabled && styles.disabled,
          customStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color={v.textColor}
            size="small"
          />
        ) : (
          <View style={styles.content}>
            {icon && <View style={styles.iconMargin}>{icon}</View>}
            <Text
              style={[
                styles.textBase,
                { color: v.textColor, fontSize },
              ]}
            >
              {children}
            </Text>
          </View>
        )}
      </Pressable>
    );
  }
);

Button.displayName = "Button";

const styles = StyleSheet.create({
  outer: {
    ...bubbleRadii,
    overflow: "hidden",
  },
  gradient: {
    alignItems: "center",
    justifyContent: "center",
    ...bubbleRadii,
  },
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...bubbleRadii,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconMargin: {
    marginRight: 8,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
  textPrimary: {
    ...Typography.button,
    color: Colors.white,
  },
  textBase: {
    ...Typography.button,
  },
});
