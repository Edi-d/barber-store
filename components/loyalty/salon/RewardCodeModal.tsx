import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { Bubble, Colors, FontFamily, Shadows, Spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The reward name shown as the modal title. */
  title: string;
  /** Voucher code encoded into the QR + shown as text. */
  code: string;
  /** Optional line under the title (e.g. expiry). */
  subtitle?: string;
}

async function copyToClipboard(code: string): Promise<boolean> {
  try {
    // Lazy require: expo-clipboard resolves its native module at load time, which
    // throws on a dev client that hasn't been rebuilt. Deferring keeps the screen
    // loadable; fall back to an Alert when the native module is absent.
    const Clipboard = require('expo-clipboard');
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return true;
  } catch {
    Alert.alert('Cod voucher', code);
    return false;
  }
}

/**
 * QR + code sheet shown after redeeming a reward and when tapping an active
 * voucher. The customer presents the code at the salon, where staff validate it.
 */
export function RewardCodeModal({ visible, onClose, title, code, subtitle }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const ok = await copyToClipboard(code);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.iconChip}>
            <Ionicons name="sparkles" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.hint}>
            {subtitle ?? 'Arată codul la salon pentru a-l folosi'}
          </Text>

          <View style={styles.qrBox}>
            {code ? (
              <QRCode value={code} size={196} color="#111827" backgroundColor="#FFFFFF" />
            ) : null}
          </View>

          <Pressable onPress={onCopy} style={[styles.codeChip, copied && styles.codeChipDone]}>
            <Text style={styles.codeText} selectable>
              {code}
            </Text>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={16}
              color={copied ? '#15803D' : Colors.primary}
            />
          </Pressable>

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Închide</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    ...Bubble.radiiLg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.lg,
  },
  iconChip: {
    width: 48,
    height: 48,
    ...Bubble.radiiSm,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 19,
    lineHeight: 25,
    color: Colors.text,
    textAlign: 'center',
  },
  hint: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  qrBox: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    ...Bubble.radii,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    marginTop: Spacing.sm,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: 16,
    ...Bubble.radiiSm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(10,102,194,0.30)',
    backgroundColor: 'rgba(10,102,194,0.05)',
  },
  codeChipDone: {
    backgroundColor: '#DCFCE7',
    borderColor: 'rgba(21,128,61,0.35)',
  },
  codeText: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 3,
    color: Colors.primary,
  },
  closeBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: 32,
    ...Bubble.radiiSm,
    backgroundColor: Colors.primary,
  },
  closeText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: '#FFFFFF',
  },
});
