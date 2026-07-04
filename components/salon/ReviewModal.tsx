import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Brand, Colors, Typography, Spacing } from '@/constants/theme';

interface ReviewModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (review: {
    rating: number;
    comment: string;
    existingPhotoUrls: string[];
    newPhotos?: Array<{ base64: string; mimeType: string }>;
  }) => Promise<void>;
  salonName: string;
  barberName?: string;
  initialRating?: number;
  initialComment?: string;
  initialPhotoUrls?: string[];
}

const STAR_COUNT = 5;
const STAR_SIZE = 40;
const AMBER = '#f59e0b';
const STAR_LABELS = ['', 'Slab', 'Ok', 'Bun', 'Foarte bun', 'Excelent'];
const MAX_PHOTOS = 5;

// uri is always a displayable URI (local file for new picks, remote URL for
// already-uploaded photos). Only new picks carry base64/mimeType — existing
// remote photos pass through untouched on submit instead of re-uploading.
type PhotoItem = { uri: string; base64?: string; mimeType?: string };

export function ReviewModal({
  visible,
  onClose,
  onSubmit,
  salonName,
  barberName,
  initialRating = 0,
  initialComment = '',
  initialPhotoUrls = [],
}: ReviewModalProps) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [photos, setPhotos] = useState<PhotoItem[]>(
    initialPhotoUrls.map((url) => ({ uri: url }))
  );
  const [loading, setLoading] = useState(false);

  // Re-sync editable state whenever the modal is (re)opened, so switching
  // between "write" and "edit" contexts (or reopening after a submit) shows
  // the right starting point instead of stale state from the previous open.
  useEffect(() => {
    if (visible) {
      setRating(initialRating);
      setComment(initialComment);
      setPhotos(initialPhotoUrls.map((url) => ({ uri: url })));
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resetState = useCallback(() => {
    setRating(initialRating);
    setComment(initialComment);
    setPhotos(initialPhotoUrls.map((url) => ({ uri: url })));
    setLoading(false);
  }, [initialRating, initialComment, initialPhotoUrls]);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleStarPress = useCallback((star: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRating(star);
  }, []);

  const handlePickPhoto = useCallback(async () => {
    if (photos.length >= MAX_PHOTOS) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const remaining = MAX_PHOTOS - photos.length;
      const newAssets = result.assets.slice(0, remaining).map((asset) => ({
        uri: asset.uri,
        base64: asset.base64 ?? '',
        mimeType: asset.mimeType ?? 'image/jpeg',
      }));
      setPhotos((prev) => [...prev, ...newAssets]);
    }
  }, [photos.length]);

  const handleRemovePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (rating === 0 || loading) return;

    setLoading(true);
    try {
      const existingPhotoUrls = photos.filter((p) => !p.base64).map((p) => p.uri);
      const newPhotos = photos.filter((p) => p.base64) as Array<{
        uri: string;
        base64: string;
        mimeType: string;
      }>;
      await onSubmit({
        rating,
        comment: comment.trim(),
        existingPhotoUrls,
        newPhotos: newPhotos.length > 0
          ? newPhotos.map((p) => ({ base64: p.base64, mimeType: p.mimeType }))
          : undefined,
      });
      resetState();
      onClose();
    } catch {
      Alert.alert('Eroare', 'Nu am putut trimite recenzia. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  }, [rating, comment, photos, loading, onSubmit, resetState, onClose]);

  const isSubmitDisabled = rating === 0 || loading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={handleClose}
    >
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Drag handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="star" size={16} color={AMBER} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {barberName ? `Recenzie pentru ${barberName}` : 'Lasă o recenzie'}
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {salonName}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              hitSlop={12}
            >
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Star Rating Card */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Cum a fost experiența?</Text>
              <View style={styles.starsRow}>
                {Array.from({ length: STAR_COUNT }, (_, i) => {
                  const star = i + 1;
                  const filled = star <= rating;
                  return (
                    <Pressable
                      key={star}
                      onPress={() => handleStarPress(star)}
                      hitSlop={4}
                    >
                      <Ionicons
                        name={filled ? 'star' : 'star-outline'}
                        size={STAR_SIZE}
                        color={filled ? AMBER : Colors.inputBorder}
                      />
                    </Pressable>
                  );
                })}
              </View>
              {rating > 0 && (
                <Text style={styles.ratingLabel}>{STAR_LABELS[rating]}</Text>
              )}
            </View>

            {/* Comment Card */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Comentariu</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Scrie o recenzie... (opțional)"
                placeholderTextColor={Colors.textTertiary}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Photo Card */}
            <View style={styles.card}>
              <View style={styles.photoHeader}>
                <Text style={styles.cardLabel}>Poze</Text>
                <Text style={styles.photoCount}>{photos.length}/{MAX_PHOTOS}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {photos.map((p, i) => (
                  <View key={`${p.uri}-${i}`} style={styles.photoTileWrap}>
                    <Image source={{ uri: p.uri }} style={styles.photoTile} resizeMode="cover" />
                    <Pressable onPress={() => handleRemovePhoto(i)} style={styles.removePhotoButton} hitSlop={8}>
                      <View style={styles.removePhotoCircle}>
                        <Ionicons name="close" size={12} color="#fff" />
                      </View>
                    </Pressable>
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <Pressable onPress={handlePickPhoto} style={styles.addPhotoTile}>
                    <Ionicons name="camera-outline" size={22} color={Brand.primary} />
                    <Text style={styles.addPhotoTileHint}>{photos.length === 0 ? 'Adaugă' : '+'}</Text>
                  </Pressable>
                )}
              </ScrollView>
              {photos.length === 0 && (
                <Text style={styles.addPhotoHint}>Arată-le altora experiența ta (până la {MAX_PHOTOS})</Text>
              )}
            </View>

            {/* Submit Button - inside scroll so it's always visible */}
            <View style={styles.submitWrap}>
              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                style={[
                  styles.submitButton,
                  isSubmitDisabled && styles.submitButtonDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Trimite recenzia</Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  /* Drag handle */
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.handleBar,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8E7',
  },
  headerTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  headerSubtitle: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4F8',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },

  /* Scroll content */
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 50 : Spacing['2xl'],
    gap: Spacing.base,
  },

  /* Card sections */
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 20,
    padding: Spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardLabel: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },

  /* Stars */
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  ratingLabel: {
    ...Typography.captionSemiBold,
    color: AMBER,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  /* Text input */
  textInput: {
    ...Typography.caption,
    color: Colors.text,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 14,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    minHeight: 100,
  },

  /* Photo */
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  photoCount: {
    ...Typography.small,
    color: Colors.textTertiary,
  },
  photoTileWrap: {
    position: 'relative',
    width: 96,
    height: 96,
  },
  photoTile: {
    width: 96,
    height: 96,
    borderRadius: 14,
  },
  addPhotoTile: {
    width: 96,
    height: 96,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.inputBorder,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.inputBackground,
    gap: 4,
  },
  addPhotoTileHint: {
    ...Typography.small,
    color: Colors.textTertiary,
  },
  addPhotoHint: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
  },
  removePhotoButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
  },
  removePhotoCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Submit */
  submitWrap: {
    marginTop: Spacing.sm,
  },
  submitButton: {
    backgroundColor: '#0A85F4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 54,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    shadowColor: '#0A85F4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#B0C4DE',
    shadowColor: '#B0C4DE',
    shadowOpacity: 0.15,
    elevation: 2,
  },
  submitButtonText: {
    ...Typography.button,
    color: '#FFFFFF',
  },
});
