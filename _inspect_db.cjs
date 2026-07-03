const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'minecontrol-os', 'data', 'minecontrol.db');
const db = new Database(dbPath);

var tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(function(t) {
  console.log('\n=== ' + t.name + ' ===');
  var cols = db.prepare('PRAGMA table_info("' + t.name + '")').all();
  cols.forEach(function(c) { console.log('  ' + c.name + ' (' + c.type + ')'); });
});

db.close();
