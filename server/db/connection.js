const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tasklearning.db');
let db = null;

async function getDB() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function closeDB() {
  if (db) {
    saveDB();
    db.close();
    db = null;
  }
}

// Auto-save cada 5 segundos si hay cambios
let dirty = false;
setInterval(() => { if (dirty) { saveDB(); dirty = false; } }, 5000);

function markDirty() { dirty = true; }

module.exports = { getDB, saveDB, closeDB, markDirty };
