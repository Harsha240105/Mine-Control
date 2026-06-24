import bcrypt from 'bcrypt';
import readline from 'readline';
import { initDatabase, getDb } from './db/database.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setup() {
  console.log('=== Minecraft Dashboard Setup ===\n');

  initDatabase();
  const db = getDb();

  console.log('Create admin user:\n');

  const username = await new Promise(resolve => {
    rl.question('Username [admin]: ', answer => resolve(answer || 'admin'));
  });

  const password = await new Promise(resolve => {
    rl.question('Password (min 8 chars): ', answer => resolve(answer));
  });

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    db.prepare(
      'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
    ).run(username, hash, username, 'admin');
    console.log(`\n Admin user "${username}" created successfully.`);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      console.error(`\nUser "${username}" already exists.`);
      console.log('Use the login endpoint instead.\n');
    } else {
      console.error(`\nError: ${err.message}`);
    }
    process.exit(1);
  }

  rl.close();
  console.log('\nSetup complete. Start the server with: npm start\n');
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
