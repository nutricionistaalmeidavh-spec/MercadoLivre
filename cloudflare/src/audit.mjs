function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanText(value, max = 300) {
  const text = value == null ? '' : String(value).trim();
  return text ? text.slice(0, max) : null;
}

export function createAuditEntry(value, options = {}) {
  if (!value?.action || !value?.actorId) throw new TypeError('action and actorId are required');
  const at = new Date(options.at ?? Date.now());
  if (Number.isNaN(at.getTime())) throw new TypeError('at must be a valid date');
  return Object.freeze({
    id: options.id ?? randomId(),
    at: at.toISOString(),
    actorId: String(value.actorId),
    action: String(value.action),
    entityType: cleanText(value.entityType, 120),
    entityId: cleanText(value.entityId, 240),
    metadata: Object.freeze({ ...(value.metadata || {}) })
  });
}

export async function appendAuditEvent(env, value, options = {}) {
  const entry = value?.id && value?.at ? value : createAuditEntry(value, options);
  await env.DB.prepare(`
    INSERT INTO audit_events (id, at, actor_id, action, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.id,
    Date.parse(entry.at),
    entry.actorId,
    entry.action,
    entry.entityType,
    entry.entityId,
    JSON.stringify(entry.metadata || {})
  ).run();
  return entry;
}

function parseMetadata(value) {
  try { return value ? JSON.parse(String(value)) : {}; } catch { return {}; }
}

export async function listAuditEvents(env, { limit = 50, action = null, entityType = null, entityId = null } = {}) {
  const clauses = [];
  const params = [];
  if (action) { clauses.push('action = ?'); params.push(String(action)); }
  if (entityType) { clauses.push('entity_type = ?'); params.push(String(entityType)); }
  if (entityId) { clauses.push('entity_id = ?'); params.push(String(entityId)); }
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 50)));
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await env.DB.prepare(`
    SELECT id, at, actor_id, action, entity_type, entity_id, metadata
    FROM audit_events
    ${where}
    ORDER BY at DESC
    LIMIT ?
  `).bind(...params, safeLimit).all();
  return (result.results || []).map((row) => ({
    id: String(row.id),
    at: Number(row.at || 0),
    actor_id: String(row.actor_id || ''),
    action: String(row.action || ''),
    entity_type: row.entity_type == null ? null : String(row.entity_type),
    entity_id: row.entity_id == null ? null : String(row.entity_id),
    metadata: parseMetadata(row.metadata)
  }));
}
