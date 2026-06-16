import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// SDK 54: shouldShowBanner/shouldShowList replaced shouldShowAlert, but we pass
// both so older SDKs keep working. Expo tolerates unknown keys.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
  }),
});

export type PushDeepLinkData = {
  deep_link?: string;
  notification_id?: string;
  type?: string;
  [k: string]: any;
};

export async function requestPushPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;
  if (!projectId) {
    console.warn('[push] no EAS projectId configured');
    return null;
  }
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    console.error('[push] getExpoPushTokenAsync failed', err);
    return null;
  }
}

/**
 * Orchestrates permission -> token -> Supabase upsert.
 * Call this early in the app lifecycle (e.g. after auth).
 */
export async function registerPushToken(): Promise<string | null> {
  const granted = await requestPushPermissions();
  if (!granted) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Tapzi',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const token = await getExpoPushToken();
  if (!token) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: 'expo',
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' }
  );

  if (error) {
    console.error('[push] failed to save token', error);
    return null;
  }

  return token;
}

/**
 * Mark current device's token inactive (e.g. on sign-out).
 */
export async function deactivatePushToken(): Promise<void> {
  try {
    const token = await getExpoPushToken();
    if (!token) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('push_tokens')
      .update({ active: false })
      .eq('user_id', user.id)
      .eq('token', token);
  } catch {
    // Silently fail — user may have already signed out
  }
}

/**
 * Log a notification interaction (opened or acted upon). Powers campaign
 * open-rate analytics (notification_log.opened_at).
 */
export async function logNotificationInteraction(
  notificationLogId: string,
  actionType?: 'booked' | 'redeemed' | 'dismissed'
): Promise<void> {
  const now = new Date().toISOString();

  await supabase
    .from('notification_log')
    .update({
      opened_at: now,
      ...(actionType ? { acted_on_at: now, action_type: actionType } : {}),
    })
    .eq('id', notificationLogId);
}

export function extractDeepLink(
  notification:
    | Notifications.Notification
    | Notifications.NotificationResponse['notification']
): string | null {
  const data = notification.request?.content?.data as
    | PushDeepLinkData
    | undefined;
  return data?.deep_link ?? null;
}
