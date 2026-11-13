/**
 * /admin is a read-only backup list (spec section 6). The operator works from
 * Telegram; nothing in /admin changes data. The edit code is kept, switched
 * off here: pages that change data return 404, their buttons are hidden, and
 * the server actions refuse to run.
 */
export const ADMIN_READ_ONLY = true;
