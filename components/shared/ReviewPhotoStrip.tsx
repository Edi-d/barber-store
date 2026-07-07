import { useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Image } from '@/components/ui/Image';
import ImageView from "react-native-image-viewing";

interface ReviewPhotoStripProps {
  photos: string[];
}

export function ReviewPhotoStrip({ photos }: ReviewPhotoStripProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const images = photos.map((uri) => ({ uri }));
  const isCarousel = photos.length >= 4;

  const renderThumb = (uri: string, i: number) => (
    <Pressable
      key={`${uri}-${i}`}
      onPress={() => setViewerIndex(i)}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Image
        source={{ uri }}
        style={{ width: 96, height: 96, borderRadius: 12 }}
        contentFit="cover"
      />
    </Pressable>
  );

  return (
    <View style={{ marginTop: 8 }}>
      {isCarousel ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          {photos.map(renderThumb)}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {photos.map(renderThumb)}
        </View>
      )}

      <ImageView
        images={images}
        imageIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
        onRequestClose={() => setViewerIndex(null)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />
    </View>
  );
}
