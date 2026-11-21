/** Words that make a password easy to guess for this panel, whatever else it contains. */
const WEAK_WORDS = ['password', 'mookalaa', 'mookala', 'qwerty', '123456', 'letmein', 'welcome'];

/**
 * Returns a message describing why a password is not acceptable, or null when
 * it is. `email` is the account the password is for, when known: a password
 * that contains the name part of the email is refused.
 */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password must be at least 10 characters long';
  }
  if (password.length > 128) return 'Password is too long';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return 'Password must contain both upper and lower case letters';
  }
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a symbol';
  const lower = password.toLowerCase();
  if (WEAK_WORDS.some((word) => lower.includes(word))) {
    return 'Password is too easy to guess: do not use words such as "password" or the product name';
  }
  const name = String(email || '').split('@')[0].toLowerCase();
  if (name.length >= 4 && lower.includes(name)) return 'Password must not contain your email name';
  return null;
}
