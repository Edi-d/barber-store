import { View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Button } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";

export default function WelcomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-12">
        {/* Logo & Branding */}
        <View className="flex-1 items-center justify-center">
          <Image
            source={require("@/assets/image-removebg-preview.png")}
            style={{ width: 180, height: 65 }}
            resizeMode="contain"
            className="mb-6"
          />
          <Text className="text-dark-500 text-center text-lg">
            Învață arta frizuriei de la cei mai buni
          </Text>
        </View>

        {/* Features */}
        <View className="mb-12">
          <FeatureItem
            icon="videocam"
            title="Cursuri Video"
            description="Lecții premium de la experți"
          />
          <FeatureItem
            icon="radio"
            title="Live Sessions"
            description="Urmărește tutoriale în direct"
          />
          <FeatureItem
            icon="cart"
            title="Shop Profesional"
            description="Produse și echipamente de calitate"
          />
        </View>

        {/* Auth Buttons */}
        <View className="gap-4 mb-8">
          <Link href="/(auth)/signup" asChild>
            <Button size="lg" className="w-full">
              Începe Acum
            </Button>
          </Link>
          <Link href="/(auth)/login" asChild>
            <Button variant="outline" size="lg" className="w-full">
              Am deja cont
            </Button>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View className="flex-row items-center mb-4">
      <View className="w-12 h-12 bg-primary-100 rounded-xl items-center justify-center mr-4">
        <Ionicons name={icon} size={24} color="#0a66c2" />
      </View>
      <View className="flex-1">
        <Text className="text-dark-700 font-semibold text-base">{title}</Text>
        <Text className="text-dark-500 text-sm">{description}</Text>
      </View>
    </View>
  );
}
