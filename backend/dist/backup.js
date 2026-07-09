import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDb } from './db.js';
const backupDir = join(process.cwd(), 'backups');
mkdirSync(backupDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filePath = join(backupDir, `rawafed-backup-${timestamp}.json`);
writeFileSync(filePath, JSON.stringify(readDb(), null, 2), 'utf8');
console.log(`Backup created: ${filePath}`);
