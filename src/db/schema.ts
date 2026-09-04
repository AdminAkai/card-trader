import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";

// ── Enums ─────────────────────────────────────────────────────────

export const conditionEnum = pgEnum("condition", [
  "MN", // Mint
  "NM", // Near Mint
  "LP", // Lightly Played
  "MP", // Moderately Played
  "HP", // Heavily Played
  "DMG", // Damaged
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "active",
  "paused",
]);

// ── Sellers ───────────────────────────────────────────────────────

export const sellers = pgTable("sellers", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Cards (canonical catalog, crowdsourced by sellers) ──────────────

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    game: text("game").notNull(), // 'pokemon' | 'mtg' | 'yugioh' | 'sports' | ...
    setName: text("set_name").notNull(),
    setCode: text("set_code"), // optional, not every game/set has one
    cardNumber: text("card_number").notNull(), // keep as text: "004/102", "SV-1"
    name: text("name").notNull(),
    variant: text("variant").notNull().default("standard"), // holo, 1st edition, foil, parallel...
    imageUrl: text("image_url"),
    createdBy: uuid("created_by").references(() => sellers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Generated column: normalizes the natural key so near-duplicate
    // entries (casing, whitespace, leading zeros) can't slip past the
    // uniqueness constraint below.
    naturalKey: text("natural_key").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`lower(${cards.game}) || '|' || lower(trim(${cards.setName})) || '|' ||
            regexp_replace(${cards.cardNumber}, '^0+', '') || '|' || lower(${cards.variant})`
    ),
  },
  (table) => ({
    naturalKeyIdx: uniqueIndex("cards_natural_key_idx").on(table.naturalKey),
  })
);

// ── Listings (one row per seller + card + condition) ─────────────────

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id),
    condition: conditionEnum("condition").notNull(),
    quantity: integer("quantity").notNull().default(0),
    priceCents: integer("price_cents").notNull(),
    status: listingStatusEnum("status").notNull().default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Mirrors the SQL constraint from earlier: a seller can't have two
    // active rows for the same card + condition — restocking updates
    // quantity on the existing row instead.
    oneListingPerSellerCardCondition: uniqueIndex(
      "one_listing_per_seller_card_condition"
    ).on(table.cardId, table.sellerId, table.condition),
    quantityNonNegative: check("quantity_non_negative", sql`${table.quantity} >= 0`),
  })
);

// ── Relations (lets Drizzle's query API do nested fetches) ───────────

export const cardsRelations = relations(cards, ({ many }) => ({
  listings: many(listings),
}));

export const listingsRelations = relations(listings, ({ one }) => ({
  card: one(cards, { fields: [listings.cardId], references: [cards.id] }),
  seller: one(sellers, {
    fields: [listings.sellerId],
    references: [sellers.id],
  }),
}));

export const sellersRelations = relations(sellers, ({ many }) => ({
  listings: many(listings),
}));