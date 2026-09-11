const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

let instance;

function databasePath() {
  return process.env.ML_DB_PATH || path.join(process.cwd(), "data", "mercadolivre.sqlite");
}

function getDatabase() {
  if (instance) return instance;
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  instance = new DatabaseSync(file);
  instance.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return instance;
}

function closeDatabase() {
  if (instance) instance.close();
  instance = undefined;
}

module.exports = { getDatabase, closeDatabase, databasePath };
