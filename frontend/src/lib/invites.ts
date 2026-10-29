import { createHash, randomBytes } from 'crypto';

/** How long an emailed invitation link stays valid. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A fresh unguessable token (192 bits). Only this goes in the email. */
export const newInviteToken = () => randomBytes(24).toString('hex');

/** What we store. A leaked database therefore cannot be used to accept anyone's invitation. */
export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const isInviteToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{48}$/.test(value);
