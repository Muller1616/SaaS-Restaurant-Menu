/**
 * Human-friendly labels for API status enums shown in the UI.
 * Keep enum values unchanged on the wire; only format for display.
 */

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIAL: "On trial",
  ACTIVE: "Active",
  NEARLY_EXPIRED: "Expiring soon",
  GRACE_PERIOD: "In grace period",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
  NO_SUBSCRIPTION: "No plan yet",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Confirmed",
  REJECTED: "Declined",
};

const TENANT_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Awaiting approval",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REJECTED: "Not approved",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Bank transfer",
  TELEBIRR: "Telebirr",
  CASH: "Cash",
};

const SUBSCRIPTION_EVENT_LABELS: Record<string, string> = {
  CREATED: "Plan started",
  RENEWED: "Renewed",
  CANCELLED: "Cancelled",
  STATUS_CHANGED: "Status updated",
  EXTENDED: "Extended",
  EXPIRED: "Expired",
  TRIAL_STARTED: "Trial started",
  TRIAL_ENDED: "Trial ended",
};

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  APPROVE: "Approved",
  REJECT: "Declined",
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  SUSPEND: "Suspended",
  ACTIVATE: "Reactivated",
  EXTEND: "Extended",
};

function titleCaseFallback(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function subscriptionStatusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return SUBSCRIPTION_STATUS_LABELS[status] ?? titleCaseFallback(status);
}

export function paymentStatusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return PAYMENT_STATUS_LABELS[status] ?? titleCaseFallback(status);
}

export function tenantStatusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return TENANT_STATUS_LABELS[status] ?? titleCaseFallback(status);
}

export function paymentMethodLabel(method: string | null | undefined) {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? titleCaseFallback(method);
}

export function subscriptionEventLabel(kind: string | null | undefined) {
  if (!kind) return "Update";
  return SUBSCRIPTION_EVENT_LABELS[kind] ?? titleCaseFallback(kind);
}

export function activityActionLabel(action: string | null | undefined) {
  if (!action) return "Action";
  return ACTIVITY_ACTION_LABELS[action] ?? titleCaseFallback(action);
}

export function activityActorLabel(userType: string | null | undefined) {
  if (userType === "ADMIN") return "Admin";
  if (userType === "TENANT") return "Restaurant";
  if (userType === "SYSTEM") return "System";
  return userType ? titleCaseFallback(userType) : "User";
}

export function filterOptionLabel(
  value: string,
  kind: "subscription" | "payment" | "tenant",
) {
  if (value === "ALL") return "All";
  if (kind === "subscription") return subscriptionStatusLabel(value);
  if (kind === "payment") return paymentStatusLabel(value);
  return tenantStatusLabel(value);
}
