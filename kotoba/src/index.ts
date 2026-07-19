/**
 * minpaku kotoba — barrel.
 *
 * Tier-2 on-chain short-term lodging on the etzhayyim substrate (AT PDS records
 * + on-chain USDC settlement via TitheRouter). Per ADR-2606011400 (on-chain-only).
 * No Stripe, no RW.
 *
 *   listing : createListing / getListing / listListings
 *   booking : createBooking / getBooking / settleBooking
 *   tithe   : splitTithe / parseMicros · nightsBetween / isValidDate (types)
 *   settle  : donateSettlementExecutor (real on-chain adapter)
 */

export * from "./types.js";
export { splitTithe, parseMicros, TITHE_PERMILLE, type TitheSplit } from "./tithe.js";
export { createListing, getListing, listListings } from "./listing.js";
export { createBooking, getBooking, settleBooking } from "./booking.js";
export { donateSettlementExecutor } from "./settlement.js";
