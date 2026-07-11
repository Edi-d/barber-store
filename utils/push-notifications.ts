import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
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

  // Claim this device token exclusively for the current user. The RPC also
  // revokes the token from any OTHER account that previously registered it on
  // this device — the fix for pushes leaking to a device that logged in as
  // someone else and never had its token deactivated (migration 159).
  const { error: rpcError } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: 'expo',
  });

  if (rpcError) {
    // Fallback for backends where migration 159 isn't deployed yet: at least
    // claim the token for this user via the direct upsert (prior behaviour).
    // This can't revoke the token from other accounts (RLS blocks that), so the
    // full cross-account fix only applies once the RPC is live.
    console.warn('[push] register_push_token RPC unavailable, upserting', rpcError);
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

// Where an unrecognised / unmappable link lands. Guarantees a notification tap
// never dead-ends on expo-router's "Unmatched Route" screen.
const DEEP_LINK_FALLBACK = '/appointments';

/**
 * Normalise a notification link to a leading-slash app path.
 *
 * Two shapes reach us:
 *   • Bare paths from the DB triggers, e.g. "/bookings/<id>". These have no
 *     scheme, so `Linking.parse` can't extract a path from them — we must use
 *     them verbatim (parsing them is exactly what produced the empty `tapzi:///`
 *     open + Unmatched Route).
 *   • Full URLs from campaigns, e.g. "tapzi://salon/<id>" or
 *     "https://tapzi.ro/salon/<id>". We strip the scheme/host to the path.
 */
function toAppPath(deepLink: string): string {
  let s = deepLink.trim();
  if (s.startsWith('/')) return s; // already a bare path
  s = s.replace(/^https?:\/\/(www\.)?tapzi\.ro/i, ''); // web origin → path
  s = s.replace(/^tapzi:\/\//i, '/'); // custom scheme → path
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    // Some other scheme — best-effort parse.
    try {
      const p = Linking.parse(s).path;
      s = p ? '/' + p.replace(/^\/+/, '') : DEEP_LINK_FALLBACK;
    } catch {
      return DEEP_LINK_FALLBACK;
    }
  }
  return s.startsWith('/') ? s : '/' + s;
}

/**
 * Resolve a notification's `deep_link` to a route that actually exists in THIS
 * client. The shared-backend triggers emit paths modelled on other apps
 * (`/bookings/<id>`, `/social/live/<id>`, the loyalty voucher paths) that don't
 * exist here, so we map them onto the real screens rather than editing the
 * shared DB. Anything already valid passes through; anything unknown falls back.
 */
export function resolveNotificationRoute(
  deepLink: string | null | undefined
): string {
  if (!deepLink) return DEEP_LINK_FALLBACK;

  const path = toAppPath(deepLink);
  const [head, ...rest] = path.split('/').filter(Boolean); // "/bookings/<id>" → ["bookings","<id>"]

  switch (head) {
    // No per-booking detail screen — every booking notification opens the list.
    case 'bookings':
    case 'appointments':
      return '/appointments';
    // Triggers say "/social/live/<id>"; this app mounts live rooms at "/live/<id>".
    case 'social':
      return rest[0] === 'live' && rest[1] ? `/live/${rest[1]}` : DEEP_LINK_FALLBACK;
    case 'live':
      return rest[0] ? `/live/${rest[0]}` : DEEP_LINK_FALLBACK;
    // "/loyalty/voucher-list" and "/loyalty/voucher-detail/<code>" collapse onto
    // the vouchers screen; "/loyalty" and other real sub-routes pass through.
    case 'loyalty':
      if (rest[0] === 'voucher-list' || rest[0] === 'voucher-detail') {
        return '/loyalty/vouchers';
      }
      return path;
    // Routes that exist as-is.
    case 'profile':
    case 'salon':
    case 'barber':
    case 'post':
    case 'product':
      return path;
    default:
      return DEEP_LINK_FALLBACK;
  }
}
