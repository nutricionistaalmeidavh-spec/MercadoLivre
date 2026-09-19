CREATE TABLE IF NOT EXISTS site_catalog_groups (
  seller_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  site_slug TEXT NOT NULL DEFAULT '',
  primary_item_id TEXT NOT NULL DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0,
  site_visibility TEXT NOT NULL DEFAULT 'hidden',
  collection_slug TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  price_mode TEXT NOT NULL DEFAULT 'marketplace',
  hero_picture_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seller_id, group_id)
);

CREATE TABLE IF NOT EXISTS site_catalog_group_items (
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (seller_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_site_catalog_groups_seller_updated
ON site_catalog_groups (seller_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_catalog_group_items_group
ON site_catalog_group_items (seller_id, group_id);
