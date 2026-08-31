import app from "./app";
import { logger } from "./lib/logger";
import { startMoveOutScheduler } from "./lib/moveOutScheduler";
import { startOwnershipChangeScheduler } from "./lib/ownershipChangeScheduler";
import { startBookingPaymentHoldScheduler } from "./lib/bookingPaymentHoldScheduler";
import { startNotificationDispatchScheduler } from "./lib/notificationDispatchScheduler";
import { startExternalIdentityDeletionScheduler } from "./lib/externalIdentityDeletionJobs";
import { startTenancyLifecycleScheduler } from "./lib/tenancyLifecycle";
import { startGuestHistoryPurgeScheduler } from "./lib/guestHistoryPurge";
import { startPortalHelpScreenshotDeletionScheduler } from "./lib/portalHelpScreenshotDeletion";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  logger.warn(
    "Schedulers assume exactly one running API server instance. A second instance requires distributed locking before it may be started.",
  );
  startMoveOutScheduler();
  startOwnershipChangeScheduler();
  startBookingPaymentHoldScheduler();
  startNotificationDispatchScheduler();
  startExternalIdentityDeletionScheduler();
  startTenancyLifecycleScheduler();
  startGuestHistoryPurgeScheduler();
  startPortalHelpScreenshotDeletionScheduler();
});
