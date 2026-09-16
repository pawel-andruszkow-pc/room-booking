/**
 * The lengths the quick views offer, shortest first, and the one a fresh
 * selection starts at.
 */
export const QUICK_MINUTES = [15, 30, 45, 60, 90, 120];
export const DEFAULT_MINUTES = 30;

/**
 * What a running meeting may be extended by. Deliberately shorter and coarser
 * than the booking slots: extending is "we need a few more minutes", and every
 * minute offered here is one the room holds against whoever comes next.
 */
export const EXTEND_MINUTES = [15, 20, 30];

/**
 * The extension a fresh selection starts at. The short one on purpose: the
 * usual case is a meeting overrunning by a few minutes, and taking 15 twice is
 * cheaper for everyone than holding the room for 30 nobody needed.
 */
export const DEFAULT_EXTEND_MINUTES = 15;

/**
 * The shortest meeting the server accepts — a floor, not a slot. A gap that
 * stops short of the smallest slot is still worth taking: the quick views
 * offer the gap itself in place of the slot above it, down to this.
 */
export const MIN_BOOKING_MINUTES = 5;

/**
 * The shortest extension there is. Below this "Extend reservation" is not
 * offered at all rather than leading to a page that can only say no.
 */
export const MIN_EXTEND_MINUTES = MIN_BOOKING_MINUTES;
