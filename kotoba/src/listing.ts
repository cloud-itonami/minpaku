/**
 * minpaku kotoba — listing tier. Listings on AT PDS records (no RW).
 * createListing / getListing / listListings.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  LISTING_COLLECTION,
  listingDid,
  listingRkey,
  type CreateListingInput,
  type CreateListingOutput,
  type GetListingInput,
  type GetListingOutput,
  type ListingRecord,
  type ListingView,
  type ListListingsInput,
  type ListListingsOutput,
} from "./types.js";
import { parseMicros } from "./tithe.js";

export async function createListing(
  e: Etzhayyim,
  input: CreateListingInput
): Promise<CreateListingOutput> {
  if (!input.listingId || !input.hostDid || !input.title) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  try {
    if (parseMicros(input.pricePerNightMicros) <= 0n) {
      return { status: "rejected", error: "priceMustBePositive" };
    }
  } catch {
    return { status: "rejected", error: "invalidPrice" };
  }

  const rkey = listingRkey(input.listingId);
  const existing = await e
    .read<ListingRecord>({ collection: LISTING_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      listingUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      listingId: input.listingId,
    };
  }

  const did = listingDid(input.listingId);
  const record: ListingRecord = {
    did,
    listingId: input.listingId,
    hostDid: input.hostDid,
    title: input.title,
    location: input.location,
    pricePerNightMicros: input.pricePerNightMicros,
    maxGuests: input.maxGuests,
    amenities: input.amenities,
    active: input.active ?? true,
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({
    collection: LISTING_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return { status: "created", listingUri: receipt.uri, did, listingId: input.listingId };
}

export async function getListing(
  e: Etzhayyim,
  input: GetListingInput
): Promise<GetListingOutput> {
  if (!input.listingId) return { error: "invalidListingId" };
  const resp = await e
    .read<ListingRecord>({ collection: LISTING_COLLECTION, rkey: listingRkey(input.listingId) })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { listing: { ...r.value, listingUri: r.uri } };
}

export async function listListings(
  e: Etzhayyim,
  input: ListListingsInput = {}
): Promise<ListListingsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ListingRecord>({
    collection: LISTING_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: ListingView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.hostDid && v.hostDid !== input.hostDid) return false;
      if (input.location && v.location !== input.location) return false;
      if (input.activeOnly && v.active !== true) return false;
      return true;
    })
    .map((r) => ({ ...r.value, listingUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}
