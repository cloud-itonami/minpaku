import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  createListing,
  getListing,
  listListings,
  createBooking,
  getBooking,
  settleBooking,
  nightsBetween,
  isValidDate,
  splitTithe,
  parseMicros,
  type SettlementExecutor,
} from "../src/index.js";

const fakeSettle: SettlementExecutor = async () => ({ txHash: "0xstay" });
const PAYOUT = "0x7777777777777777777777777777777777777777";

describe("minpaku kotoba", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:minpaku.etzhayyim.com" });
  });

  describe("date helpers", () => {
    it("computes whole nights (UTC)", () => {
      expect(nightsBetween("2026-07-01", "2026-07-04")).toBe(3);
      expect(nightsBetween("2026-07-04", "2026-07-01")).toBe(0);
      expect(nightsBetween("2026-07-01", "2026-07-01")).toBe(0);
    });
    it("validates dates", () => {
      expect(isValidDate("2026-07-01")).toBe(true);
      expect(isValidDate("2026-7-1")).toBe(false);
      expect(isValidDate("nope")).toBe(false);
    });
    it("tithe splits 10% with no leak", () => {
      const s = splitTithe(parseMicros("300000000"));
      expect(s.tithe).toBe(30_000_000n);
      expect(s.tithe + s.net).toBe(s.gross);
    });
  });

  describe("listing", () => {
    const l = {
      listingId: "L-1",
      hostDid: "did:web:alice.etzhayyim.com",
      title: "Kyoto machiya",
      pricePerNightMicros: "100000000", // 100 USDC/night
      location: "kyoto",
      maxGuests: 4,
    };
    it("creates + gets + lists", async () => {
      expect((await createListing(e, l)).status).toBe("created");
      expect((await getListing(e, { listingId: "L-1" })).listing?.title).toBe("Kyoto machiya");
      expect((await listListings(e, { location: "kyoto", activeOnly: true })).total).toBe(1);
    });
    it("is idempotent", async () => {
      await createListing(e, l);
      expect((await createListing(e, l)).status).toBe("alreadyExists");
    });
    it("rejects non-positive price", async () => {
      expect((await createListing(e, { ...l, pricePerNightMicros: "0" })).status).toBe("rejected");
    });
  });

  describe("booking + settlement", () => {
    beforeEach(async () => {
      await createListing(e, {
        listingId: "L-1",
        hostDid: "did:web:alice.etzhayyim.com",
        title: "Kyoto machiya",
        pricePerNightMicros: "100000000",
        maxGuests: 4,
      });
    });
    it("creates a booking with computed nights + total", async () => {
      const r = await createBooking(e, {
        bookingId: "B-1",
        listingId: "L-1",
        guestDid: "did:web:bob.etzhayyim.com",
        checkIn: "2026-07-01",
        checkOut: "2026-07-04",
        guests: 2,
      });
      expect(r.status).toBe("created");
      expect(r.nights).toBe(3);
      expect(r.totalMicros).toBe("300000000"); // 3 × 100
      expect((await getBooking(e, { bookingId: "B-1" })).booking?.status).toBe("pending_payment");
    });
    it("rejects checkout-before-checkin", async () => {
      const r = await createBooking(e, {
        bookingId: "B-X",
        listingId: "L-1",
        guestDid: "did:web:bob.etzhayyim.com",
        checkIn: "2026-07-04",
        checkOut: "2026-07-01",
      });
      expect(r.status).toBe("rejected");
    });
    it("rejects too many guests", async () => {
      const r = await createBooking(e, {
        bookingId: "B-G",
        listingId: "L-1",
        guestDid: "did:web:bob.etzhayyim.com",
        checkIn: "2026-07-01",
        checkOut: "2026-07-02",
        guests: 9,
      });
      expect(r.status).toBe("rejected");
      expect(r.error).toBe("tooManyGuests");
    });
    it("booking on missing listing → listingNotFound", async () => {
      const r = await createBooking(e, {
        bookingId: "B-N",
        listingId: "NOPE",
        guestDid: "did:web:bob.etzhayyim.com",
        checkIn: "2026-07-01",
        checkOut: "2026-07-02",
      });
      expect(r.status).toBe("listingNotFound");
    });
    it("settles on-chain: tithe split + booking→confirmed", async () => {
      await createBooking(e, {
        bookingId: "B-1",
        listingId: "L-1",
        guestDid: "did:web:bob.etzhayyim.com",
        checkIn: "2026-07-01",
        checkOut: "2026-07-04",
      });
      const s = await settleBooking(e, fakeSettle, { bookingId: "B-1", to: PAYOUT });
      expect(s.status).toBe("settled");
      expect(s.titheMicros).toBe("30000000"); // 10% of 300
      expect(s.netMicros).toBe("270000000");
      expect((await getBooking(e, { bookingId: "B-1" })).booking?.status).toBe("confirmed");
    });
    it("does not double-settle", async () => {
      await createBooking(e, {
        bookingId: "B-1",
        listingId: "L-1",
        guestDid: "did:web:bob.etzhayyim.com",
        checkIn: "2026-07-01",
        checkOut: "2026-07-04",
      });
      await settleBooking(e, fakeSettle, { bookingId: "B-1", to: PAYOUT });
      expect((await settleBooking(e, fakeSettle, { bookingId: "B-1", to: PAYOUT })).status).toBe(
        "alreadyConfirmed"
      );
    });
  });
});
