const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

let instance;

function databasePath() {
  return process.env.ML_DB_PATH || path.join(process.cwd(), "data", "mercadolivre.sqlite");
}

function getDatabase() {
  if (instance) return instance;
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  instance = new Database(file);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");
  return instance;
}

function closeDatabase() {
  if (instance) instance.close();
  instance = undefined;
}

module.exports = { getDatabase, closeDatabase, databasePath };
