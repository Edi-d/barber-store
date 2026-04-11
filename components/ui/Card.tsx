/**
 * Card — general-purpose content card with squircle radii and a subtle border.
 * Supports optional press handling via `onPress`.
 * Composed with `CardHeader`, `CardContent`, and `CardFooter` sub-components.
 *
 * For frosted-glass auth form containers use `GlassCard` from
 * `@/components/auth/GlassCard` instead.
 */
import { View, Pressable, StyleSheet } from "react-native";
import { cn } from "@/lib/utils";
import { Bubble } from "@/constants/theme";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: object;
  onPress?: () => void;
}

export function Card({ children, className, style, onPress }: CardProps) {
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      className={cn(
        "bg-white p-4 border border-dark-300",
        onPress && "active:opacity-80",
        className
      )}
      style={[styles.card, style]}
    >
      {children}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    borderTopLeftRadius: Bubble.radii.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radii.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radii.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radii.borderBottomLeftRadius,
  },
});

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn("mb-3", className)}>{children}</View>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn(className)}>{children}</View>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn("mt-3 pt-3 border-t border-dark-300", className)}>{children}</View>;
}
