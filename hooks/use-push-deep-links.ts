import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { extractDeepLink, logNotificationInteraction, PushDeepLinkData } from '@/utils/push-notifications';

/**
 * Routes a notification tap to the right in-app screen instead of opening the
 * web URL. Campaign pushes carry `data.deep_link`, which the backend resolves
 * to e.g. https://tapzi.ro/salon/<id> (an associated-domain universal link) or
 * tapzi://salon/<id>. We parse out the path and router.push it so the native
 * salon screen opens directly.
 */
function routeFromDeepLink(
  router: ReturnType<typeof useRouter>,
  deepLink: string | null,
): void {
  if (!deepLink) return;
  try {
    // Linking.parse strips both the tapzi:// scheme and the https://tapzi.ro
    // host, leaving the route path (e.g. 'salon/123').
    const { path } = Linking.parse(deepLink);
    if (path) {
      router.push(('/' + path) as any);
      return;
    }
  } catch {
    // fall through to OS-level open
  }
  Linking.openURL(deepLink).catch(() => {});
}

function handleResponse(
  router: ReturnType<typeof useRouter>,
  response: Notifications.NotificationResponse,
): void {
  const data = response.notification.request.content.data as PushDeepLinkData | undefined;
  // Best-effort open tracking for campaign analytics.
  if (data?.notification_id) {
    logNotificationInteraction(String(data.notification_id)).catch(() => {});
  }
  routeFromDeepLink(router, extractDeepLink(response.notification));
}

export function usePushDeepLinks(): void {
  const router = useRouter();
  // Guard against double-handling the cold-start response if the listener also
  // fires for the same interaction.
  const handledColdStart = useRef(false);

  useEffect(() => {
    // Cold start: app was launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !handledColdStart.current) {
        handledColdStart.current = true;
        handleResponse(router, response);
      }
    });

    // Warm: app already running / backgrounded when the tap happens.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(router, response);
    });

    return () => sub.remove();
  }, [router]);
}
