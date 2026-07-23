import {
  activityActionLabel,
  activityActorLabel,
  paymentStatusLabel,
  subscriptionStatusLabel,
} from "./status-labels";

type ActivityLike = {
  action: string;
  entityType: string;
  entityLabel: string | null;
  actorLabel: string;
  userType: string;
  summary: string;
  details: unknown;
};

function asRecord(details: unknown): Record<string, unknown> | null {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return null;
}

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function quoted(name: string | null | undefined) {
  if (!name) return null;
  // Prefer short business / item names over "Name <email>" blobs.
  const short = name.split("·")[0]?.split("<")[0]?.trim() || name;
  return `"${short}"`;
}

/**
 * Turn an activity log into a concise, human-readable sentence.
 * Prefer server `summary` when already clean; never dump raw JSON.
 */
export function formatActivitySummary(log: ActivityLike): string {
  const details = asRecord(log.details);
  const entityName =
    quoted(log.entityLabel) ||
    quoted(str(details?.businessName)) ||
    quoted(str(details?.name)) ||
    quoted(str(details?.title));

  const planName = str(details?.plan) || str(details?.planName);
  const status = str(details?.status) || str(details?.toStatus);
  const fromStatus = str(details?.fromStatus);

  switch (log.entityType) {
    case "tenant":
      if (log.action === "APPROVE") {
        return entityName
          ? `Restaurant ${entityName} was approved.`
          : "A restaurant registration was approved.";
      }
      if (log.action === "REJECT") {
        return entityName
          ? `Restaurant ${entityName} was declined.`
          : "A restaurant registration was declined.";
      }
      if (log.action === "SUSPEND") {
        return entityName
          ? `Restaurant ${entityName} was suspended.`
          : "A restaurant account was suspended.";
      }
      if (log.action === "ACTIVATE") {
        return entityName
          ? `Restaurant ${entityName} was reactivated.`
          : "A restaurant account was reactivated.";
      }
      if (log.action === "CREATE") {
        return entityName
          ? `Restaurant ${entityName} submitted a registration.`
          : "A restaurant registration was submitted.";
      }
      break;

    case "menu_item":
      if (log.action === "CREATE") {
        return entityName
          ? `Menu item ${entityName} was created.`
          : "A menu item was created.";
      }
      if (log.action === "UPDATE") {
        return entityName
          ? `Menu item ${entityName} was updated.`
          : "A menu item was updated.";
      }
      if (log.action === "DELETE") {
        return entityName
          ? `Menu item ${entityName} was deleted.`
          : "A menu item was deleted.";
      }
      break;

    case "category":
      if (log.action === "CREATE") {
        return entityName
          ? `Menu category ${entityName} was created.`
          : "A menu category was created.";
      }
      if (log.action === "UPDATE") {
        return entityName
          ? `Menu category ${entityName} was updated.`
          : "A menu category was updated.";
      }
      if (log.action === "DELETE") {
        return entityName
          ? `Menu category ${entityName} was deleted.`
          : "A menu category was deleted.";
      }
      break;

    case "subscription":
      if (log.action === "EXTEND") {
        return entityName
          ? `Subscription for ${entityName.replaceAll('"', "")} was extended.`
          : "A subscription was extended.";
      }
      if (log.action === "SUSPEND") {
        return "Subscription was suspended.";
      }
      if (log.action === "ACTIVATE") {
        return "Subscription was activated.";
      }
      if (log.action === "CANCEL") {
        return "Subscription was cancelled.";
      }
      if (log.action === "UPDATE" && planName) {
        return `Subscription upgraded to ${planName}.`;
      }
      if (status) {
        const label = subscriptionStatusLabel(status);
        if (fromStatus) {
          return `Subscription status changed from ${subscriptionStatusLabel(fromStatus)} to ${label}.`;
        }
        return `Subscription status changed to ${label}.`;
      }
      break;

    case "payment":
      if (log.action === "APPROVE") {
        return entityName
          ? `Payment for ${entityName.replaceAll('"', "")} was approved.`
          : "Payment was approved.";
      }
      if (log.action === "REJECT") {
        return entityName
          ? `Payment for ${entityName.replaceAll('"', "")} was declined.`
          : "Payment was declined.";
      }
      if (status) {
        return `Payment status changed to ${paymentStatusLabel(status)}.`;
      }
      break;

    case "branch_qr":
    case "branch_qr_style":
      if (log.action === "UPDATE" || log.action === "CREATE") {
        return "QR code regenerated successfully.";
      }
      break;

    case "plan":
      if (log.action === "UPDATE" && entityName) {
        return `Plan ${entityName} was updated.`;
      }
      break;

    case "announcement":
      if (log.action === "CREATE") {
        const title = str(details?.title);
        return title
          ? `Announcement "${title}" was sent.`
          : "An announcement was sent.";
      }
      break;
  }

  if (log.action === "LOGIN" || log.action === "LOGOUT") {
    const who =
      log.actorLabel.split("<")[0]?.split("·")[0]?.trim() ||
      activityActorLabel(log.userType);
    return `${who} ${log.action === "LOGIN" ? "signed in" : "signed out"}.`;
  }

  // Prefer a clean server summary when it isn't a raw dump.
  const server = log.summary?.trim();
  if (server && !server.startsWith("{") && !server.startsWith("[")) {
    return server.endsWith(".") ? server : `${server}.`;
  }

  const who =
    log.actorLabel.split("<")[0]?.split("·")[0]?.trim() ||
    activityActorLabel(log.userType);
  const action = activityActionLabel(log.action).toLowerCase();
  const target = entityName
    ? ` ${entityName}`
    : log.entityType
      ? ` ${log.entityType.replaceAll("_", " ")}`
      : "";
  return `${who} ${action}${target}.`;
}
