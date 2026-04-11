import { TextInput, View, Text, Pressable } from "react-native";
import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Bubble } from "@/constants/theme";

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
          style={{
            flexDirection: "row",
            alignItems: multiline ? "flex-start" : "center",
            height: multiline ? undefined : 52,
            minHeight: multiline ? 100 : undefined,
            paddingHorizontal: 16,
            backgroundColor: Colors.inputBackground,
            ...Bubble.radiiSm,
            borderWidth: 2,
            borderColor: error
              ? Colors.error
              : isFocused
                ? Colors.inputFocusBorder
                : Colors.inputBorder,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {icon && <View style={{ marginRight: 12 }}>{icon}</View>}
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={Colors.textTertiary}
            secureTextEntry={secureTextEntry && !showPassword}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete}
            editable={!disabled}
            multiline={multiline}
            numberOfLines={numberOfLines}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={{
              flex: 1,
              color: Colors.text,
              fontSize: 16,
              fontFamily: 'EuclidCircularA-Regular',
              textAlignVertical: multiline ? "top" : "center",
              paddingVertical: multiline ? 12 : 0,
            }}
          />
          {secureTextEntry && (
            <Pressable onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={20}
                color={Colors.textSecondary}
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
