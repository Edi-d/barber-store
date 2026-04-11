import { Text, type TextStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { parseCaption } from '@/lib/parseHashtags';
import { Brand, Typography } from '@/constants/theme';

interface HashtagTextProps {
  text: string;
  numberOfLines?: number;
  style?: TextStyle | TextStyle[];
  onHashtagPress: (name: string) => void;
}

/**
 * Drop-in replacement for a plain caption <Text>.
 * Renders plain text and tappable hashtag segments inline.
 *
 * IMPORTANT: Uses nested <Text onPress> inside an outer <Text>, NOT Pressable
 * inside Text. This is the only pattern that correctly honours numberOfLines
 * on React Native while still allowing per-segment press handling.
 */
export function HashtagText({ text, numberOfLines, style, onHashtagPress }: HashtagTextProps) {
  const segments = parseCaption(text);

  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      ellipsizeMode="tail"
    >
      {segments.map((segment, index) => {
        if (segment.type === 'hashtag') {
          // Strip the leading "#" when calling back — consumer gets just the name.
          const name = segment.value.slice(1);
          return (
            <Text
              key={index}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onHashtagPress(name);
              }}
              style={{
                color: Brand.primary,
                fontFamily: 'EuclidCircularA-SemiBold',
              }}
            >
              {segment.value}
            </Text>
          );
        }

        return (
          <Text key={index} style={style}>
            {segment.value}
          </Text>
        );
      })}
    </Text>
  );
}
