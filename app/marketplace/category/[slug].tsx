import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const displayName = slug
    ? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '';

  return (
    <ScrollView
      className="flex-1 bg-[#F0F4F8]"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={{ paddingTop: insets.top }}>
        <TouchableOpacity
          className="flex-row items-center px-4 py-3"
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={22} color={Colors.text} />
          <Text
            style={[
              Typography.h3,
              { marginLeft: Spacing.sm, color: Colors.text },
            ]}
          >
            {displayName}
          </Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1 items-center justify-center" style={{ paddingTop: 80 }}>
        <Feather name="package" size={48} color={Colors.textTertiary} />
        <Text
          style={[
            Typography.h3,
            { color: Colors.textSecondary, marginTop: Spacing.md, textAlign: 'center' },
          ]}
        >
          {displayName}
        </Text>
        <Text
          style={[
            Typography.body,
            { color: Colors.textTertiary, marginTop: Spacing.sm, textAlign: 'center' },
          ]}
        >
          In curand
        </Text>
      </View>
    </ScrollView>
  );
}
