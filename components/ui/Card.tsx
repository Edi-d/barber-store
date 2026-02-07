import { View, Pressable } from "react-native";
import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onPress?: () => void;
}

export function Card({ children, className, onPress }: CardProps) {
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      className={cn(
        "bg-white rounded-2xl p-4 border border-dark-300",
        onPress && "active:opacity-80",
        className
      )}
    >
      {children}
    </Wrapper>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn("mb-3", className)}>{children}</View>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn(className)}>{children}</View>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn("mt-3 pt-3 border-t border-dark-300", className)}>{children}</View>;
}
