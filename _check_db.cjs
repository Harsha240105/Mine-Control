const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.env.APPDATA, 'minecontrol-os', 'data', 'minecontrol.db');
console.log('DB:', dbPath);
console.log('DB exists:', fs.existsSync(dbPath));

if (!fs.existsSync(dbPath)) {
  const devPath = path.join(__dirname, 'data', 'minecontrol.db');
  console.log('Trying dev path:', devPath);
  if (fs.existsSync(devPath)) {
    const db = new Database(devPath);
    dumpDB(db);
    db.close();
  } else {
    console.log('No database found at either path');
  }
} else {
  const db = new Database(dbPath);
  dumpDB(db);
  db.close();
}

function dumpDB(db) {
  console.log('\n=== SCHEMA VERSION ===');
  try { console.log(JSON.stringify(db.prepare('SELECT MAX(version) as v FROM schema_version').get())); } catch(e) { console.log('Error:', e.message); }

  console.log('\n=== ALL TABLES ===');
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    console.log(tables.map(t => t.name));
  } catch(e) { console.log('Error:', e.message); }

  const feedbackLike = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%feedback%' OR name LIKE '%sync%' OR name LIKE '%issue%' OR name LIKE '%github%')").all();
  console.log('\n=== Feedback/sync/github tables ===');
  if (feedbackLike.length === 0) { console.log('NONE FOUND'); return; }
  console.log(feedbackLike.map(t => t.name));

  for (const tbl of feedbackLike) {
    console.log(`\n=== ${tbl.name} ===`);
    try {
      const rows = db.prepare(`SELECT * FROM ${tbl.name}`).all();
      console.log(JSON.stringify(rows, null, 2));
    } catch(e) { console.log('Error:', e.message); }
  }
}
