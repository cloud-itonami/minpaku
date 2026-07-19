/**
 * minpaku kotoba — record types.
 *
 * Tier-2 function-split per ADR-2606011400 (on-chain-only). Short-term lodging
 * (民泊): listings + bookings on AT PDS records; bookings settle on-chain (USDC +
 * ERC-4337 + TitheRouter 10% Public-Fund split). No Stripe, no RW.
 * ADR-2605172000 kotoba.
 *
 * Amounts are USDC base units (micros) as decimal STRINGS. Dates are YYYY-MM-DD.
 *
 * Identity hierarchy:
 *   did:web:minpaku.etzhayyim.com                          — controller
 *   did:web:minpaku.etzhayyim.com:listing:{listingId}      — a listing
 *   did:web:minpaku.etzhayyim.com:booking:{bookingId}      — a booking
 */

export const MINPAKU_DID_PREFIX = "did:web:minpaku.etzhayyim.com:" as const;

export const LISTING_COLLECTION = "com.etzhayyim.apps.minpaku.listing";
export const BOOKING_COLLECTION = "com.etzhayyim.apps.minpaku.booking";
export const PAYMENT_COLLECTION = "com.etzhayyim.apps.minpaku.payment";

export type MinpakuPaymentPurpose = "internal-purchase" | "escrow-refund";

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "refunded";

// ─── Listing ────────────────────────────────────────────────────────

export interface ListingRecord {
  did: string;
  listingId: string;
  hostDid: string;
  title: string;
  location?: string;
  /** Nightly rate, USDC micros as string. */
  pricePerNightMicros: string;
  maxGuests?: number;
  amenities?: string[];
  active: boolean;
  createdAt: string;
}

export interface ListingView extends ListingRecord {
  listingUri: string;
}

export interface CreateListingInput {
  listingId: string;
  hostDid: string;
  title: string;
  pricePerNightMicros: string;
  location?: string;
  maxGuests?: number;
  amenities?: string[];
  active?: boolean;
}

export interface CreateListingOutput {
  status: "created" | "alreadyExists" | "rejected";
  listingUri?: string;
  did?: string;
  listingId?: string;
  error?: string;
}

export interface GetListingInput {
  listingId: string;
}

export interface GetListingOutput {
  listing?: ListingView;
  error?: string;
}

export interface ListListingsInput {
  hostDid?: string;
  location?: string;
  activeOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListListingsOutput {
  items: ListingView[];
  cursor?: string;
  total: number;
}

// ─── Booking ────────────────────────────────────────────────────────

export interface BookingRecord {
  did: string;
  bookingId: string;
  listingId: string;
  guestDid: string;
  /** YYYY-MM-DD. */
  checkIn: string;
  checkOut: string;
  nights: number;
  guests?: number;
  /** nights × pricePerNightMicros, USDC micros as string. */
  totalMicros: string;
  status: BookingStatus;
  txHash?: string;
  createdAt: string;
}

export interface BookingView extends BookingRecord {
  bookingUri: string;
}

export interface CreateBookingInput {
  bookingId: string;
  listingId: string;
  guestDid: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
}

export interface CreateBookingOutput {
  status: "created" | "alreadyExists" | "rejected" | "listingNotFound";
  bookingUri?: string;
  did?: string;
  bookingId?: string;
  nights?: number;
  totalMicros?: string;
  error?: string;
}

export interface GetBookingInput {
  bookingId: string;
}

export interface GetBookingOutput {
  booking?: BookingView;
  error?: string;
}

// ─── On-chain settlement ────────────────────────────────────────────

export interface PaymentRecord {
  bookingId: string;
  listingId: string;
  guestDid: string;
  purpose: MinpakuPaymentPurpose;
  grossMicros: string;
  titheMicros: string;
  netMicros: string;
  txHash?: string;
  settledAt: string;
}

export interface SettlementExecutor {
  (opts: {
    to: string;
    amountMicros: bigint;
    purpose: MinpakuPaymentPurpose;
    memo?: string;
    forUri?: string;
  }): Promise<{ txHash: string }>;
}

export interface SettleBookingInput {
  bookingId: string;
  /** Host payout address (Base L2). */
  to: string;
  memo?: string;
}

export interface SettleBookingOutput {
  status: "settled" | "rejected" | "notFound" | "alreadyConfirmed";
  paymentUri?: string;
  txHash?: string;
  titheMicros?: string;
  netMicros?: string;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(d: string): boolean {
  if (!RE_DATE.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t);
}

/** Whole nights between two YYYY-MM-DD dates (UTC); 0 if checkOut <= checkIn. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  const nights = Math.round((b - a) / 86_400_000);
  return nights > 0 ? nights : 0;
}

export function listingDid(listingId: string): string {
  return `${MINPAKU_DID_PREFIX}listing:${listingId.toLowerCase()}`;
}

export function listingRkey(listingId: string): string {
  return `listing-${listingId.toLowerCase()}`;
}

export function bookingDid(bookingId: string): string {
  return `${MINPAKU_DID_PREFIX}booking:${bookingId.toLowerCase()}`;
}

export function bookingRkey(bookingId: string): string {
  return `booking-${bookingId.toLowerCase()}`;
}

export function paymentRkey(bookingId: string): string {
  return `payment-${bookingId.toLowerCase()}`;
}
