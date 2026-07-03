import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.env.APPDATA, 'minecontrol-os', 'data', 'minecontrol.db');
console.log('DB:', dbPath);
console.log('DB exists:', fs.existsSync(dbPath));

const db = new Database(dbPath);

console.log('\n=== SCHEMA VERSION ===');
try { console.log(JSON.stringify(db.prepare('SELECT MAX(version) as v FROM schema_version').get())); } catch(e) { console.log('Error:', e.message); }

console.log('\n=== ALL TABLES ===');
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(tables.map(t => t.name));
} catch(e) { console.log('Error:', e.message); }

const feedbackCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%feedback%' OR name LIKE '%sync%' OR name LIKE '%issue%' OR name LIKE '%github%')").all();
console.log('\n=== Feedback/sync/issue/github tables ===');
console.log(feedbackCheck.map(t => t.name));

if (feedbackCheck.length > 0) {
  for (const tbl of feedbackCheck) {
    console.log(`\n=== ${tbl.name} contents ===`);
    try {
      const rows = db.prepare(`SELECT * FROM ${tbl.name}`).all();
      console.log(JSON.stringify(rows, null, 2));
    } catch(e) { console.log('Error:', e.message); }
  }
}

db.close();
