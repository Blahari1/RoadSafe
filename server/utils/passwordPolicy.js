// Password rules for password RESET. (Registration only requires 8 characters;
// a reset must not be weaker than that, and adds basic strength checks.)
const MIN_LENGTH = 8;
const MAX_BYTES = 72; // bcrypt silently ignores anything past 72 bytes

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "iloveyou", "admin123", "welcome1", "letmein123",
  "abc12345", "roadsafe", "roadsafe1", "roadsafe123",
]);

// Returns { error } or { ok: true }.
const validateNewPassword = (password, { email } = {}) => {
  if (typeof password !== "string") {
    return { error: "Password is required" };
  }

  if (password.length < MIN_LENGTH) {
    return { error: `Password must contain at least ${MIN_LENGTH} characters` };
  }

  if (Buffer.byteLength(password, "utf8") > MAX_BYTES) {
    return { error: `Password must not exceed ${MAX_BYTES} bytes` };
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { error: "Password must contain at least one letter and one number" };
  }

  const lower = password.toLowerCase();

  if (COMMON.has(lower)) {
    return { error: "That password is too common. Choose a less predictable one" };
  }

  if (typeof email === "string" && email) {
    const normalized = email.trim().toLowerCase();
    const localPart = normalized.split("@")[0];

    if (lower === normalized || (localPart.length >= 4 && lower === localPart)) {
      return { error: "Password must not be the same as your email address" };
    }
  }

  return { ok: true };
};

module.exports = { validateNewPassword, MIN_LENGTH, MAX_BYTES };
