/**
 * minpaku kotoba — booking + on-chain settlement tier.
 *
 * createBooking computes nights × nightly-rate and writes a booking
 * (pending_payment). settleBooking settles on-chain USDC via an injected
 * SettlementExecutor (real: wrap @etzhayyim/sdk donate() → TitheRouter 10%
 * split), writes a payment record, and confirms the booking. No Stripe, no RW.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  BOOKING_COLLECTION,
  LISTING_COLLECTION,
  PAYMENT_COLLECTION,
  bookingDid,
  bookingRkey,
  isValidDate,
  listingRkey,
  nightsBetween,
  paymentRkey,
  type BookingRecord,
  type CreateBookingInput,
  type CreateBookingOutput,
  type GetBookingInput,
  type GetBookingOutput,
  type ListingRecord,
  type PaymentRecord,
  type SettlementExecutor,
  type SettleBookingInput,
  type SettleBookingOutput,
} from "./types.js";
import { parseMicros, splitTithe } from "./tithe.js";

export async function createBooking(
  e: Etzhayyim,
  input: CreateBookingInput
): Promise<CreateBookingOutput> {
  if (!input.bookingId || !input.listingId || !input.guestDid) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isValidDate(input.checkIn) || !isValidDate(input.checkOut)) {
    return { status: "rejected", error: "invalidDate" };
  }
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights <= 0) return { status: "rejected", error: "checkOutMustBeAfterCheckIn" };

  const listingResp = await e
    .read<ListingRecord>({ collection: LISTING_COLLECTION, rkey: listingRkey(input.listingId) })
    .catch(() => ({ records: [] }));
  const listing = listingResp.records[0]?.value;
  if (!listing) return { status: "listingNotFound", error: "listingNotFound" };
  if (!listing.active) return { status: "rejected", error: "listingInactive" };
  if (typeof listing.maxGuests === "number" && (input.guests ?? 1) > listing.maxGuests) {
    return { status: "rejected", error: "tooManyGuests" };
  }

  const total = parseMicros(listing.pricePerNightMicros) * BigInt(nights);

  const rkey = bookingRkey(input.bookingId);
  const existing = await e
    .read<BookingRecord>({ collection: BOOKING_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      bookingUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      bookingId: input.bookingId,
    };
  }

  const did = bookingDid(input.bookingId);
  const record: BookingRecord = {
    did,
    bookingId: input.bookingId,
    listingId: input.listingId,
    guestDid: input.guestDid,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    guests: input.guests,
    totalMicros: total.toString(),
    status: "pending_payment",
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({
    collection: BOOKING_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "created",
    bookingUri: receipt.uri,
    did,
    bookingId: input.bookingId,
    nights,
    totalMicros: record.totalMicros,
  };
}

export async function getBooking(
  e: Etzhayyim,
  input: GetBookingInput
): Promise<GetBookingOutput> {
  if (!input.bookingId) return { error: "invalidBookingId" };
  const resp = await e
    .read<BookingRecord>({ collection: BOOKING_COLLECTION, rkey: bookingRkey(input.bookingId) })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { booking: { ...r.value, bookingUri: r.uri } };
}

export async function settleBooking(
  e: Etzhayyim,
  settle: SettlementExecutor,
  input: SettleBookingInput
): Promise<SettleBookingOutput> {
  if (!input.bookingId || !input.to) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const resp = await e
    .read<BookingRecord>({ collection: BOOKING_COLLECTION, rkey: bookingRkey(input.bookingId) })
    .catch(() => ({ records: [] }));
  const bookingRec = resp.records[0];
  if (!bookingRec?.value) return { status: "notFound", error: "bookingNotFound" };
  const booking = bookingRec.value;
  if (booking.status !== "pending_payment") {
    return booking.status === "confirmed"
      ? { status: "alreadyConfirmed", error: "bookingAlreadyConfirmed" }
      : { status: "rejected", error: `bookingNotPayable:${booking.status}` };
  }

  const split = splitTithe(parseMicros(booking.totalMicros));
  const { txHash } = await settle({
    to: input.to,
    amountMicros: split.gross,
    purpose: "internal-purchase",
    memo: input.memo,
    forUri: bookingRec.uri,
  });

  const payment: PaymentRecord = {
    bookingId: booking.bookingId,
    listingId: booking.listingId,
    guestDid: booking.guestDid,
    purpose: "internal-purchase",
    grossMicros: split.gross.toString(),
    titheMicros: split.tithe.toString(),
    netMicros: split.net.toString(),
    txHash,
    settledAt: new Date().toISOString(),
  };
  const payReceipt = await e.write({
    collection: PAYMENT_COLLECTION,
    record: payment as unknown as Record<string, unknown>,
    rkey: paymentRkey(booking.bookingId),
  });

  await e.write({
    collection: BOOKING_COLLECTION,
    record: { ...booking, status: "confirmed", txHash } as unknown as Record<string, unknown>,
    rkey: bookingRkey(booking.bookingId),
  });

  return {
    status: "settled",
    paymentUri: payReceipt.uri,
    txHash,
    titheMicros: payment.titheMicros,
    netMicros: payment.netMicros,
  };
}
