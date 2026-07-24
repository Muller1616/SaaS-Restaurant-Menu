import axios from "axios";

const GENERIC = "Something went wrong. Please try again.";

const CODE_MESSAGES: Record<string, string> = {
  TOKEN_REVOKED: "Your session has ended. Please sign in again.",
  ACTIVATION_EMAIL_FAILED:
    "Could not send the activation email. The restaurant was not approved — fix SMTP and try again.",
  SUPER_ADMIN_REQUIRED: "This action requires a super admin account.",
  TENANT_SUSPENDED: "This restaurant account is suspended.",
  TENANT_INACTIVE: "This restaurant account is not active.",
};

/**
 * Map API / network failures to short user-facing copy.
 * Never surfaces stack traces, Prisma codes, or raw Axios internals.
 */
export function getUserFacingError(
  error: unknown,
  fallback = GENERIC,
): string {
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error && error.message && !/status code/i.test(error.message)) {
      // Prefer caller fallback over opaque Error.message from non-Axios throws.
      return fallback;
    }
    return fallback;
  }

  if (!error.response) {
    return "Network error. Check your connection and try again.";
  }

  const status = error.response.status;
  const data = error.response.data as
    | { message?: unknown; details?: { code?: string } }
    | undefined;
  const code = data?.details?.code;
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];

  const apiMessage =
    typeof data?.message === "string" ? data.message.trim() : "";

  // Allow short, human API messages; reject internals.
  if (
    apiMessage &&
    apiMessage.length <= 180 &&
    !/prisma|database_url|stack|at\s+\w+\s+\(/i.test(apiMessage) &&
    !/ECONNREFUSED|ENOTFOUND|ETL/i.test(apiMessage)
  ) {
    return apiMessage;
  }

  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You don’t have permission to do that.";
  if (status === 404) return "We couldn’t find what you were looking for.";
  if (status === 409) return "That conflicts with existing data. Refresh and try again.";
  if (status === 429) return "Too many attempts. Please wait and try again.";
  if (status >= 500) return "The server had a problem. Please try again shortly.";

  return fallback;
}
