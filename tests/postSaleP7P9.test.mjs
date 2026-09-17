import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const auditPath = 'cloudflare/src/audit.mjs';
const alertsPath = 'cloudflare/src/alerts.mjs';
const migrationPath = 'cloudflare/migrations/0005_audit_alerts.sql';
const qaConfigPath = 'qa/artisys-qa.config.json';
const qaFlowsPath = 'qa/flows/post-sale.json';

test('P7 adds durable D1 audit log with append/list API', async () => {
  assert.equal(fs.existsSync(migrationPath), true);
  assert.equal(fs.existsSync(auditPath), true);
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const audit = await import(`../${auditPath}?t=${Date.now()}`);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS audit_events/i);
  assert.equal(typeof audit.appendAuditEvent, 'function');
  assert.equal(typeof audit.listAuditEvents, 'function');
  const entry = audit.createAuditEntry({ actorId: 'admin', action: 'message_rule.updated', entityType: 'listing', entityId: 'MLB1', metadata: { changed: ['message'] } }, { id: 'a1', at: '2026-09-17T00:00:00Z' });
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(entry.action, 'message_rule.updated');
});

test('P7 instruments rule changes and post-sale delivery outcomes', () => {
  const rules = fs.readFileSync('cloudflare/src/message-rules.mjs', 'utf8');
  const automation = fs.readFileSync('cloudflare/src/automation.mjs', 'utf8');
  assert.match(rules, /appendAuditEvent/);
  assert.match(rules, /message_rule\.(created|updated|enabled|disabled)/);
  assert.match(automation, /post_sale\.(dry_run|sent|moderated|failed|skipped)/);
});

test('P8 adds persistent alerts compatible with ArtiSys Alerts lifecycle', async () => {
  assert.equal(fs.existsSync(alertsPath), true);
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const alerts = await import(`../${alertsPath}?t=${Date.now()}`);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS alerts/i);
  assert.equal(typeof alerts.createAlert, 'function');
  assert.equal(typeof alerts.upsertAlert, 'function');
  assert.equal(typeof alerts.listAlerts, 'function');
  const alert = alerts.createAlert({ id: 'x1', entityRef: { kind: 'order', id: '10' }, title: 'Mensagem moderada', severity: 'warning', metadata: { reason: 'moderated' } }, { now: '2026-09-17T00:00:00Z' });
  assert.equal(alert.status, 'active');
  assert.equal(Object.isFrozen(alert), true);
});

test('P8 covers required post-sale operational alert reasons', () => {
  const automation = fs.readFileSync('cloudflare/src/automation.mjs', 'utf8');
  for (const reason of ['MISSING_PRODUCT_LINK', 'BUYER_IDENTITY_FALLBACK', 'MESSAGE_MODERATED', 'MESSAGE_SEND_FAILED', 'NO_OTHER_MESSAGE_CAP', 'CAPS_UNAVAILABLE', 'ACTION_GUIDE_UNAVAILABLE']) {
    assert.match(automation, new RegExp(reason));
  }
  const operations = fs.readFileSync('cloudflare/src/operations.mjs', 'utf8');
  assert.match(operations, /audit_events/);
  assert.match(operations, /alerts/);
});

test('P9 integrates ArtiSys QA profiles and post-sale flow without production mutation', () => {
  assert.equal(fs.existsSync(qaConfigPath), true);
  assert.equal(fs.existsSync(qaFlowsPath), true);
  const config = JSON.parse(fs.readFileSync(qaConfigPath, 'utf8'));
  const flow = JSON.parse(fs.readFileSync(qaFlowsPath, 'utf8'));
  assert.equal(config.systemId, 'mercado-livre-artisys');
  assert.deepEqual(config.qaProfiles.quick.flows, ['post-sale']);
  assert.ok(config.qaProfiles.release.criticalFlows.includes('post-sale'));
  assert.equal(flow.productionMutation, false);
  const scenarios = new Set(flow.scenarios.map((x) => x.id));
  for (const id of ['buyer-name', 'buyer-nickname-fallback', 'buyer-generic-fallback', 'greeting-morning', 'greeting-afternoon', 'greeting-night', 'valid-link', 'invalid-link', 'message-too-long', 'policy-blocked', 'dry-run', 'moderated']) {
    assert.equal(scenarios.has(id), true, `missing QA scenario ${id}`);
  }
});
