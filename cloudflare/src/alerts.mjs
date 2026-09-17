const SEVERITIES = new Set(['info', 'warning', 'critical']);

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

export function createAlert({ id, entityRef, title, severity = 'info', reason = null, metadata = {} } = {}, { now = new Date().toISOString() } = {}) {
  if (!entityRef?.kind || !entityRef?.id) throw new TypeError('Alert entityRef kind and id are required');
  if (!SEVERITIES.has(severity)) throw new TypeError('Alert severity must be info, warning or critical');
  const createdAt = new Date(now);
  if (Number.isNaN(createdAt.getTime())) throw new TypeError('now must be a valid date');
  return Object.freeze({
    id: required(id, 'Alert id'),
    entityRef: Object.freeze({ kind: required(entityRef.kind, 'Entity kind'), id: required(entityRef.id, 'Entity id') }),
    title: required(title, 'Alert title'),
    severity,
    reason: reason == null ? null : String(reason),
    status: 'active',
    createdAt: createdAt.toISOString(),
    metadata: Object.freeze({ ...metadata })
  });
}

function parseMetadata(value) {
  try { return value ? JSON.parse(String(value)) : {}; } catch { return {}; }
}

export async function upsertAlert(env, value, options = {}) {
  const alert = value?.entityRef && value?.createdAt ? value : createAlert(value, options);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO alerts
      (id, entity_kind, entity_id, title, severity, status, reason, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      severity=excluded.severity,
      status='active',
      reason=excluded.reason,
      metadata=excluded.metadata,
      updated_at=excluded.updated_at,
      acknowledged_at=NULL,
      acknowledged_by=NULL,
      dismissed_at=NULL,
      dismissed_by=NULL,
      dismiss_reason=NULL
  `).bind(
    alert.id,
    alert.entityRef.kind,
    alert.entityRef.id,
    alert.title,
    alert.severity,
    alert.reason,
    JSON.stringify(alert.metadata || {}),
    Date.parse(alert.createdAt),
    now
  ).run();
  return alert;
}

export async function listAlerts(env, { limit = 50, status = 'active' } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 50)));
  const filter = status === 'all' ? '' : 'WHERE status = ?';
  const statement = env.DB.prepare(`
    SELECT id, entity_kind, entity_id, title, severity, status, reason, metadata,
           created_at, updated_at, acknowledged_at, acknowledged_by, dismissed_at, dismissed_by, dismiss_reason
    FROM alerts
    ${filter}
    ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, updated_at DESC
    LIMIT ?
  `);
  const result = status === 'all'
    ? await statement.bind(safeLimit).all()
    : await statement.bind(String(status), safeLimit).all();
  return (result.results || []).map((row) => ({
    id: String(row.id),
    entity_ref: { kind: String(row.entity_kind || ''), id: String(row.entity_id || '') },
    title: String(row.title || ''),
    severity: String(row.severity || 'info'),
    status: String(row.status || 'active'),
    reason: row.reason == null ? null : String(row.reason),
    metadata: parseMetadata(row.metadata),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
    acknowledged_at: row.acknowledged_at == null ? null : Number(row.acknowledged_at),
    acknowledged_by: row.acknowledged_by == null ? null : String(row.acknowledged_by),
    dismissed_at: row.dismissed_at == null ? null : Number(row.dismissed_at),
    dismissed_by: row.dismissed_by == null ? null : String(row.dismissed_by),
    dismiss_reason: row.dismiss_reason == null ? null : String(row.dismiss_reason)
  }));
}

export async function acknowledgeAlert(env, id, actorId = 'admin') {
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE alerts SET status='acknowledged', acknowledged_at=?, acknowledged_by=?, updated_at=?
    WHERE id=? AND status!='dismissed'
  `).bind(now, String(actorId), now, String(id)).run();
}

export async function dismissAlert(env, id, { actorId = 'admin', reason = 'dismissed' } = {}) {
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE alerts SET status='dismissed', dismissed_at=?, dismissed_by=?, dismiss_reason=?, updated_at=?
    WHERE id=?
  `).bind(now, String(actorId), String(reason), now, String(id)).run();
}
