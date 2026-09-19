export async function listSiteCatalogDecisions(env, sellerId) {
  const result = await env.DB.prepare(`
    SELECT seller_id, item_id, approved, site_visibility, collection_slug,
           site_name, site_slug, featured, price_mode, hero_picture_url, created_at, updated_at
    FROM site_catalog_decisions
    WHERE seller_id=?
    ORDER BY updated_at DESC, item_id ASC
  `).bind(String(sellerId)).all();
  return (result.results || []).map((row) => ({
    ...row,
    approved: Number(row.approved || 0) === 1,
    featured: Number(row.featured || 0) === 1
  }));
}

export async function upsertSiteCatalogDecision(env, sellerId, decision) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO site_catalog_decisions
      (seller_id, item_id, approved, site_visibility, collection_slug, site_name, site_slug, featured, price_mode, hero_picture_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(seller_id, item_id) DO UPDATE SET
      approved=excluded.approved,
      site_visibility=excluded.site_visibility,
      collection_slug=excluded.collection_slug,
      site_name=excluded.site_name,
      site_slug=excluded.site_slug,
      featured=excluded.featured,
      price_mode=excluded.price_mode,
      hero_picture_url=excluded.hero_picture_url,
      updated_at=excluded.updated_at
  `).bind(
    String(sellerId),
    String(decision.itemId),
    decision.approved ? 1 : 0,
    decision.siteVisibility,
    decision.collectionSlug || "",
    decision.siteName || "",
    decision.siteSlug || "",
    decision.featured ? 1 : 0,
    decision.priceMode || "marketplace",
    decision.heroPictureUrl || "",
    now,
    now
  ).run();

  return env.DB.prepare(`
    SELECT seller_id, item_id, approved, site_visibility, collection_slug,
           site_name, site_slug, featured, price_mode, hero_picture_url, created_at, updated_at
    FROM site_catalog_decisions
    WHERE seller_id=? AND item_id=?
  `).bind(String(sellerId), String(decision.itemId)).first();
}
