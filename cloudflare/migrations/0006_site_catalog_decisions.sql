CREATE TABLE IF NOT EXISTS site_catalog_decisions (
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  site_visibility TEXT NOT NULL DEFAULT 'hidden',
  collection_slug TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  site_slug TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  price_mode TEXT NOT NULL DEFAULT 'marketplace',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seller_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_site_catalog_decisions_public
  ON site_catalog_decisions (seller_id, approved, site_visibility, updated_at);
