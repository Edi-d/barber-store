import { TextInput, View, Text, Pressable } from "react-native";
import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";

interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: "email" | "password" | "username" | "name" | "off";
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    {
      value,
      onChangeText,
      placeholder,
      label,
      error,
      secureTextEntry = false,
      keyboardType = "default",
      autoCapitalize = "none",
      autoComplete = "off",
      icon,
      className,
      disabled = false,
      multiline = false,
      numberOfLines = 1,
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    return (
      <View className={cn("w-full", className)}>
        {label && (
          <Text className="text-dark-600 text-sm font-medium mb-2">
            {label}
          </Text>
        )}
        <View
          className={cn(
            "flex-row items-center bg-dark-200 rounded-xl px-4 border-2",
            isFocused ? "border-primary-500" : "border-dark-300",
            error && "border-red-500",
            disabled && "opacity-50"
          )}
        >
          {icon && <View className="mr-3">{icon}</View>}
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#94a3b8"
            secureTextEntry={secureTextEntry && !showPassword}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete}
            editable={!disabled}
            multiline={multiline}
            numberOfLines={numberOfLines}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              "flex-1 text-dark-700 py-4 text-base",
              multiline && "min-h-[100px] py-3"
            )}
            style={{ textAlignVertical: multiline ? "top" : "center" }}
          />
          {secureTextEntry && (
            <Pressable onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={20}
                color="#64748b"
              />
            </Pressable>
          )}
        </View>
        {error && (
          <Text className="text-red-600 text-sm mt-1">{error}</Text>
        )}
      </View>
    );
  }
);

Input.displayName = "Input";
