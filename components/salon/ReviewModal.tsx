import { useState, useCallback } from 'react';
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
    photoBase64?: string;
    photoMimeType?: string;
  }) => Promise<void>;
  salonName: string;
}

const STAR_COUNT = 5;
const STAR_SIZE = 40;
const AMBER = '#f59e0b';
const STAR_LABELS = ['', 'Slab', 'Ok', 'Bun', 'Foarte bun', 'Excelent'];

export function ReviewModal({
  visible,
  onClose,
  onSubmit,
  salonName,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetState = useCallback(() => {
    setRating(0);
    setComment('');
    setPhotoUri(null);
    setPhotoBase64(null);
    setPhotoMimeType(null);
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleStarPress = useCallback((star: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRating(star);
  }, []);

  const handlePickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      setPhotoBase64(asset.base64 ?? null);
      setPhotoMimeType(asset.mimeType ?? 'image/jpeg');
    }
  }, []);

  const handleRemovePhoto = useCallback(() => {
    setPhotoUri(null);
    setPhotoBase64(null);
    setPhotoMimeType(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (rating === 0 || loading) return;

    setLoading(true);
    try {
      await onSubmit({
        rating,
        comment: comment.trim(),
        photoBase64: photoBase64 ?? undefined,
        photoMimeType: photoMimeType ?? undefined,
      });
      resetState();
      onClose();
    } catch {
      Alert.alert('Eroare', 'Nu am putut trimite recenzia. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  }, [rating, comment, photoBase64, photoMimeType, loading, onSubmit, resetState, onClose]);

  const isSubmitDisabled = rating === 0 || loading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={handleClose}
    >
      <StatusBar style="light" />
      <View style={styles.container}>
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
                  Lasă o recenzie
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
              <Text style={styles.cardLabel}>Poză</Text>
              {photoUri ? (
                <View style={styles.photoPreviewContainer}>
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.photoPreview}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={handleRemovePhoto}
                    style={styles.removePhotoButton}
                    hitSlop={8}
                  >
                    <View style={styles.removePhotoCircle}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </View>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={handlePickPhoto} style={styles.addPhotoBox}>
                  <View style={styles.cameraIconWrap}>
                    <Ionicons name="camera-outline" size={24} color={Brand.primary} />
                  </View>
                  <Text style={styles.addPhotoText}>Adaugă o poză</Text>
                  <Text style={styles.addPhotoHint}>Arată-le altora experiența ta</Text>
                </Pressable>
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
      </View>
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
  addPhotoBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.inputBorder,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    height: 150,
    backgroundColor: Colors.inputBackground,
  },
  cameraIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Brand.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  addPhotoHint: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  photoPreviewContainer: {
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 14,
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
