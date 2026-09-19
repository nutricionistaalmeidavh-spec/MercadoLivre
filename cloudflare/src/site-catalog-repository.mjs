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

function mapGroup(row) {
  if (!row) return null;
  return {
    ...row,
    approved: Number(row.approved || 0) === 1,
    featured: Number(row.featured || 0) === 1
  };
}

export async function listSiteCatalogGroups(env, sellerId) {
  const result = await env.DB.prepare(`
    SELECT seller_id, group_id, site_name, site_slug, primary_item_id,
           approved, site_visibility, collection_slug, featured, price_mode,
           hero_picture_url, created_at, updated_at
    FROM site_catalog_groups
    WHERE seller_id=?
    ORDER BY updated_at DESC, group_id ASC
  `).bind(String(sellerId)).all();
  return (result.results || []).map(mapGroup);
}

export async function listSiteCatalogGroupItems(env, sellerId) {
  const result = await env.DB.prepare(`
    SELECT seller_id, item_id, group_id, created_at
    FROM site_catalog_group_items
    WHERE seller_id=?
    ORDER BY group_id ASC, item_id ASC
  `).bind(String(sellerId)).all();
  return result.results || [];
}

export async function getSiteCatalogGroup(env, sellerId, groupId) {
  const row = await env.DB.prepare(`
    SELECT seller_id, group_id, site_name, site_slug, primary_item_id,
           approved, site_visibility, collection_slug, featured, price_mode,
           hero_picture_url, created_at, updated_at
    FROM site_catalog_groups
    WHERE seller_id=? AND group_id=?
  `).bind(String(sellerId), String(groupId)).first();
  return mapGroup(row);
}

export async function createSiteCatalogGroup(env, sellerId, group) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO site_catalog_groups
      (seller_id, group_id, site_name, site_slug, primary_item_id, approved,
       site_visibility, collection_slug, featured, price_mode, hero_picture_url,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    String(sellerId),
    String(group.groupId),
    group.siteName || "",
    group.siteSlug || "",
    group.primaryItemId || "",
    group.approved ? 1 : 0,
    group.siteVisibility || "hidden",
    group.collectionSlug || "",
    group.featured ? 1 : 0,
    group.priceMode || "marketplace",
    group.heroPictureUrl || "",
    now,
    now
  ).run();
  return getSiteCatalogGroup(env, sellerId, group.groupId);
}

export async function updateSiteCatalogGroup(env, sellerId, group) {
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE site_catalog_groups SET
      site_name=?, site_slug=?, primary_item_id=?, approved=?, site_visibility=?,
      collection_slug=?, featured=?, price_mode=?, hero_picture_url=?, updated_at=?
    WHERE seller_id=? AND group_id=?
  `).bind(
    group.siteName || "",
    group.siteSlug || "",
    group.primaryItemId || "",
    group.approved ? 1 : 0,
    group.siteVisibility || "hidden",
    group.collectionSlug || "",
    group.featured ? 1 : 0,
    group.priceMode || "marketplace",
    group.heroPictureUrl || "",
    now,
    String(sellerId),
    String(group.groupId)
  ).run();
  return getSiteCatalogGroup(env, sellerId, group.groupId);
}

export async function replaceSiteCatalogGroupItems(env, sellerId, groupId, itemIds) {
  const normalizedSeller = String(sellerId);
  const normalizedGroup = String(groupId);
  const uniqueIds = [...new Set((itemIds || []).map((value) => String(value || "").trim()).filter(Boolean))];

  for (const itemId of uniqueIds) {
    const existing = await env.DB.prepare(`
      SELECT group_id FROM site_catalog_group_items
      WHERE seller_id=? AND item_id=?
    `).bind(normalizedSeller, itemId).first();
    if (existing && String(existing.group_id) !== normalizedGroup) {
      const error = new Error(`O anúncio ${itemId} já pertence a outro grupo.`);
      error.code = "ITEM_ALREADY_GROUPED";
      throw error;
    }
  }

  const previous = await env.DB.prepare(`
    SELECT item_id FROM site_catalog_group_items
    WHERE seller_id=? AND group_id=?
  `).bind(normalizedSeller, normalizedGroup).all();
  const removedIds = (previous.results || [])
    .map((row) => String(row.item_id || ""))
    .filter((itemId) => itemId && !uniqueIds.includes(itemId));

  const now = Date.now();
  const statements = [
    ...removedIds.map((itemId) => env.DB.prepare(`
      UPDATE site_catalog_decisions
      SET approved=0, updated_at=?
      WHERE seller_id=? AND item_id=?
    `).bind(now, normalizedSeller, itemId)),
    env.DB.prepare(`DELETE FROM site_catalog_group_items WHERE seller_id=? AND group_id=?`).bind(normalizedSeller, normalizedGroup),
    ...uniqueIds.map((itemId) => env.DB.prepare(`
      INSERT INTO site_catalog_group_items (seller_id, item_id, group_id, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(normalizedSeller, itemId, normalizedGroup, now))
  ];
  await env.DB.batch(statements);
  return uniqueIds;
}

export async function deleteSiteCatalogGroup(env, sellerId, groupId) {
  const normalizedSeller = String(sellerId);
  const normalizedGroup = String(groupId);
  const members = await env.DB.prepare(`
    SELECT item_id FROM site_catalog_group_items
    WHERE seller_id=? AND group_id=?
  `).bind(normalizedSeller, normalizedGroup).all();
  const now = Date.now();
  await env.DB.batch([
    ...(members.results || []).map((row) => env.DB.prepare(`
      UPDATE site_catalog_decisions
      SET approved=0, updated_at=?
      WHERE seller_id=? AND item_id=?
    `).bind(now, normalizedSeller, String(row.item_id || ""))),
    env.DB.prepare(`DELETE FROM site_catalog_group_items WHERE seller_id=? AND group_id=?`).bind(normalizedSeller, normalizedGroup),
    env.DB.prepare(`DELETE FROM site_catalog_groups WHERE seller_id=? AND group_id=?`).bind(normalizedSeller, normalizedGroup)
  ]);
}
