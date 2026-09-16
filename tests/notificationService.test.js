const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artisys-ml-notify-"));
process.env.ML_DB_PATH = path.join(dir, "test.sqlite");
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || "test-key";

const { closeDatabase } = require("../src/core/database/sqlite");
const { enqueueNotification } = require("../src/modules/mercado-livre/notifications/notificationService");

const payload = {
  resource: "/orders/2195160686",
  user_id: 468424240,
  topic: "orders_v2",
  application_id: 7397781723111552,
  attempts: 1,
  sent: "2026-09-10T20:00:00.000Z",
  received: "2026-09-10T20:00:00.000Z"
};

test("notificação duplicada entra uma única vez na fila", () => {
  const first = enqueueNotification(payload);
  const second = enqueueNotification(payload);
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
  assert.equal(first.eventKey, second.eventKey);
});

test.after(() => {
  closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
});
