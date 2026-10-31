/**
 * A guest's email is optional on a staff booking, but the guests table needs one (and keeps one guest per email).
 * A booking without an email gets its own placeholder address so it never merges with another guest.
 * The placeholder is never shown and never emailed.
 */
const PLACEHOLDER_DOMAIN = '@no-email.kipd.local';

export const placeholderEmail = () => `guest-${crypto.randomUUID()}${PLACEHOLDER_DOMAIN}`;
export const isPlaceholderEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith(PLACEHOLDER_DOMAIN);
/** The email to show or send to, or '' when the guest left none. */
export const realEmail = (email?: string | null) => (isPlaceholderEmail(email) ? '' : email ?? '');
