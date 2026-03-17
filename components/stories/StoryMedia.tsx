import { useState } from "react";
import {
  Image,
  StyleSheet,
  ActivityIndicator,
  View,
} from "react-native";
import { Video, ResizeMode } from "expo-av";

type StoryMediaProps = {
  type: "image" | "video";
  uri: string;
  isPaused: boolean;
  onMediaReady: () => void;
  onVideoEnd?: () => void;
};

export function StoryMedia({
  type,
  uri,
  isPaused,
  onMediaReady,
  onVideoEnd,
}: StoryMediaProps) {
  const [isLoading, setIsLoading] = useState(true);

  const handleReady = () => {
    setIsLoading(false);
    onMediaReady();
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {type === "video" ? (
        <Video
          source={{ uri }}
          resizeMode={ResizeMode.COVER}
          shouldPlay={!isPaused}
          isLooping={false}
          style={StyleSheet.absoluteFill}
          onReadyForDisplay={handleReady}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded && status.didJustFinish) {
              onVideoEnd?.();
            }
          }}
        />
      ) : (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onLoad={handleReady}
        />
      )}

      {isLoading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
});
