import * as SQLite from 'expo-sqlite';
import { migrate } from './migrations';

const DB_NAME = 'attendance.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** One connection per JS runtime (UI and headless tasks share it while the app process is alive). */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
      await migrate(db);
      return db;
    })().catch((e: unknown) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}
