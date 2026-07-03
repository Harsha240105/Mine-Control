const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'minecontrol-os', 'data', 'minecontrol.db');
console.log('Target DB:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function hasColumn(tableName, colName) {
  var cols = db.prepare('PRAGMA table_info("' + tableName + '")').all();
  return cols.some(function(c) { return c.name === colName; });
}

function hasTable(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

// ===== STEP 1: Rebuild feedback_tickets with v13 schema =====
// The old table has: id, ticket_id, title, description, type, status, username, 
//   diagnostic_data, screenshot_paths, votes, github_url, created_at, updated_at
// New table needs: summary, issue_type, sync_status, priority, etc.
console.log('=== STEP 1: Rebuild feedback_tickets ===');

if (hasColumn('feedback_tickets', 'title')) {
  console.log('Old schema detected (has title column). Rebuilding...');

  // Rename old table
  db.exec("ALTER TABLE feedback_tickets RENAME TO feedback_tickets_old");
  console.log('  Renamed old table to feedback_tickets_old');

  // Create new v13 table
  db.exec(`
    CREATE TABLE feedback_tickets (
      id TEXT PRIMARY KEY,
      ticket_id TEXT UNIQUE NOT NULL,
      issue_type TEXT NOT NULL DEFAULT 'general' CHECK(issue_type IN ('bug','feature','performance','crash','general')),
      summary TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','in_review','resolved','closed','rejected')),
      username TEXT NOT NULL,
      server_id TEXT,
      server_name TEXT DEFAULT '',
      world_name TEXT DEFAULT '',
      player_count INTEGER DEFAULT 0,
      minecraft_version TEXT DEFAULT '',
      server_software TEXT DEFAULT '',
      connected_plugins TEXT DEFAULT '[]',
      connected_mods TEXT DEFAULT '[]',
      connection_mode TEXT DEFAULT '',
      diagnostic_data TEXT,
      diagnostic_sanitized INTEGER NOT NULL DEFAULT 1,
      screenshot_paths TEXT DEFAULT '[]',
      attachment_paths TEXT DEFAULT '[]',
      log_snapshots TEXT DEFAULT '{}',
      error_stack_trace TEXT DEFAULT '',
      github_url TEXT,
      issue_tracker_url TEXT DEFAULT '',
      issue_tracker_id TEXT DEFAULT '',
      sync_status TEXT NOT NULL DEFAULT 'local' CHECK(sync_status IN ('local','pending','synced','failed')),
      sync_retries INTEGER NOT NULL DEFAULT 0,
      sync_last_attempt TEXT,
      sync_error TEXT DEFAULT '',
      github_state TEXT DEFAULT '',
      github_labels TEXT DEFAULT '[]',
      github_milestone TEXT DEFAULT '',
      github_assignee TEXT DEFAULT '',
      github_created_at TEXT DEFAULT '',
      github_updated_at TEXT DEFAULT '',
      last_synced_at TEXT DEFAULT '',
      duplicate_of TEXT DEFAULT '',
      votes INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
      last_status_change_by TEXT DEFAULT '',
      last_status_change_at TEXT,
      developer_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('  Created new feedback_tickets table');

  // Copy data from old table
  try {
    var copyResult = db.exec(`
      INSERT INTO feedback_tickets (
        id, ticket_id, issue_type, summary, description, status, username,
        diagnostic_data, screenshot_paths, github_url, votes, created_at, updated_at
      )
      SELECT 
        id, 
        COALESCE(ticket_id, 'OLD-' || id),
        CASE 
          WHEN type = 'bug' THEN 'bug'
          WHEN type = 'feature' THEN 'feature'
          WHEN type = 'performance' THEN 'performance'
          WHEN type = 'crash' THEN 'crash'
          ELSE 'general'
        END,
        title,
        description,
        CASE 
          WHEN status = 'in_progress' THEN 'in_review'
          ELSE COALESCE(status, 'open')
        END,
        username,
        diagnostic_data,
        COALESCE(screenshot_paths, '[]'),
        github_url,
        COALESCE(votes, 0),
        COALESCE(created_at, datetime('now')),
        COALESCE(updated_at, datetime('now'))
      FROM feedback_tickets_old
    `);
    console.log('  Data copied from old table');
  } catch (e) {
    console.log('  Data copy FAILED:', e.message);
  }

  // Drop old table
  try { db.exec("DROP TABLE IF EXISTS feedback_tickets_old"); console.log('  Dropped old table'); } catch(e) { console.log('  Drop old table skipped:', e.message); }
} else {
  console.log('  New schema already in place');
}

// ===== STEP 2: Create sync_queue =====
console.log('\n=== STEP 2: sync_queue ===');
if (!hasTable('sync_queue')) {
  db.exec("CREATE TABLE sync_queue (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'create' CHECK(action IN ('create','update','sync')), payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')), retries INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 10, error TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), last_attempt TEXT, completed_at TEXT, FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE)");
  console.log('  Created');
} else {
  console.log('  Already exists');
}

// ===== STEP 3: Create issue_tracker_config =====
console.log('\n=== STEP 3: issue_tracker_config ===');
if (!hasTable('issue_tracker_config')) {
  db.exec("CREATE TABLE issue_tracker_config (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, provider TEXT NOT NULL DEFAULT 'github', url TEXT NOT NULL DEFAULT '', api_token TEXT DEFAULT '', repository TEXT DEFAULT '', project_key TEXT DEFAULT '', enabled INTEGER NOT NULL DEFAULT 0, auto_sync INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(server_id))");
  console.log('  Created');
} else {
  console.log('  Already exists');
}

// ===== STEP 4: Create github_comments =====
console.log('\n=== STEP 4: github_comments ===');
if (!hasTable('github_comments')) {
  db.exec("CREATE TABLE github_comments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, github_comment_id INTEGER NOT NULL, author TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT '', FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_github_comments_ticket ON github_comments(ticket_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_github_comments_github_id ON github_comments(github_comment_id)");
  console.log('  Created');
} else {
  console.log('  Already exists');
}

// ===== STEP 5: Ensure v13 in schema_version =====
console.log('\n=== STEP 5: schema_version ===');
var maxVer = db.prepare("SELECT MAX(version) as v FROM schema_version").get();
var latest = maxVer ? maxVer.v || 0 : 0;
console.log('Current max version:', latest);
if (latest < 13) {
  db.prepare("INSERT INTO schema_version (version) VALUES (13)").run();
  console.log('  Set to version 13');
} else {
  console.log('  Already at version 13 or higher');
}

// ===== VERIFICATION =====
console.log('\n=== VERIFICATION ===');
var finalVer = db.prepare("SELECT MAX(version) as v FROM schema_version").get();
console.log('Schema version:', finalVer.v);

console.log('\nNew tables:');
['sync_queue', 'issue_tracker_config', 'github_comments'].forEach(function(t) {
  console.log('  ' + t + ': ' + (hasTable(t) ? 'OK' : 'MISSING'));
});

console.log('\nFeedback ticket columns:');
var cols = db.prepare("PRAGMA table_info('feedback_tickets')").all();
var expected = ['id','ticket_id','issue_type','summary','description','status','username',
  'sync_status','priority','github_url','github_state','github_labels','github_milestone',
  'github_assignee','github_created_at','github_updated_at','last_synced_at','duplicate_of'];
var missing = expected.filter(function(e) { return !cols.some(function(c) { return c.name === e; }); });
cols.forEach(function(c) { console.log('  ' + c.name + ' (' + c.type + ')'); });
if (missing.length > 0) console.log('\n  MISSING COLUMNS:', missing.join(', '));

console.log('\nExisting feedback tickets:');
var tickets = db.prepare("SELECT id, ticket_id, issue_type, summary, status, github_url FROM feedback_tickets ORDER BY created_at DESC LIMIT 10").all();
console.log(JSON.stringify(tickets, null, 2));

db.close();
console.log('\nMigration complete.');
