/**
 * notificationDispatchScheduler.ts
 *
 * Starts a periodic scheduler that processes due notification_events rows.
 * Runs every 30 seconds (sufficiently frequent for near-real-time delivery
 * while keeping DB load minimal).
 *
 * Mirrors the pattern used by bookingPaymentHoldScheduler:
 *   - Runs once immediately on start.
 *   - setInterval with .unref() so the process can exit cleanly in tests.
 */

import { logger } from "./logger";
import { dispatchPendingNotifications } from "./notificationService";

const TICK_INTERVAL_MS = 30_000; // 30 seconds

export function startNotificationDispatchScheduler(): void {
  const run = async () => {
    try {
      const delivered = await dispatchPendingNotifications();
      if (delivered > 0) {
        logger.info(
          { delivered },
          "notification-dispatch-scheduler: delivered notifications",
        );
      }
    } catch (err) {
      logger.error(
        { err },
        "notification-dispatch-scheduler: unhandled error in tick",
      );
    }
  };

  void run();
  setInterval(() => void run(), TICK_INTERVAL_MS).unref();

  logger.info(
    { intervalMs: TICK_INTERVAL_MS },
    "notification-dispatch-scheduler: started",
  );
}
