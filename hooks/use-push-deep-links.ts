import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  extractDeepLink,
  logNotificationInteraction,
  resolveNotificationRoute,
  PushDeepLinkData,
} from '@/utils/push-notifications';

/**
 * Routes a notification tap to the right in-app screen. Notification links
 * arrive either as bare trigger paths ("/bookings/<id>") or full campaign URLs
 * ("tapzi://salon/<id>" / "https://tapzi.ro/salon/<id>"). resolveNotificationRoute
 * normalises both and maps them onto routes that exist in this client, with a
 * fallback so a tap never lands on the "Unmatched Route" screen.
 */
function routeFromDeepLink(
  router: ReturnType<typeof useRouter>,
  deepLink: string | null,
): void {
  if (!deepLink) return;
  router.push(resolveNotificationRoute(deepLink) as any);
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
