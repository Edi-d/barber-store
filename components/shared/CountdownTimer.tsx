import { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Expirat");
        return;
      }
      const totalMins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (totalMins >= 60) {
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        setRemaining(`${hrs}h ${mins}m`);
      } else {
        setRemaining(`${totalMins}:${secs.toString().padStart(2, "0")}`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return (
    <View className="flex-row items-center">
      <Ionicons name="timer-outline" size={11} color="#f59e0b" />
      <Text className="text-amber-600 text-[10px] font-bold ml-1">
        {remaining}
      </Text>
    </View>
  );
}
