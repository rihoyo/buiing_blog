// Only return fixed error identifiers. Never expose server details or credentials.
export async function guestErrorCode(error) {
  if (
    error?.name === "FunctionsFetchError" ||
    error?.name === "FunctionsRelayError"
  )
    return "GUEST_CONNECTION_FAILED";
  const response = error?.context;
  let data;
  try {
    data = await response?.json();
  } catch {}
  const known = [
    "REQUEST_TOO_LARGE",
    "GUEST_SETUP_REQUIRED",
    "GUEST_DATABASE_SETUP_REQUIRED",
    "GUEST_SERVER_SETUP_REQUIRED",
    "RATE_LIMIT",
    "BLOCKED_WORD",
    "INVALID_PASSWORD",
    "INVALID_CONTENT",
    "INVALID_PARENT",
    "ACCOUNT_BANNED",
    "FORBIDDEN",
    "POST_PRIVATE",
    "ENTRY_NOT_FOUND",
    "ORIGIN_NOT_ALLOWED",
  ];
  if (known.includes(data?.error)) return data.error;
  if (response?.status === 401) return "GUEST_JWT_REJECTED";
  if (response?.status === 404) return "GUEST_FUNCTION_MISSING";
  if (response?.status === 503 || data?.code === "BOOT_ERROR")
    return "GUEST_FUNCTION_START_FAILED";
  return "GUEST_REQUEST_FAILED";
}
