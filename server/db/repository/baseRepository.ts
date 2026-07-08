import Database from 'better-sqlite3';
import { getDatabase } from '../../database';

export function db(): Database.Database {
  return getDatabase();
}
