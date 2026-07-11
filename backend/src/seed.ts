import bcrypt from 'bcryptjs';
import { updateDb } from './db.js';
import { UserRecord } from './types.js';

const now = new Date().toISOString();
const users = [
  { username: 'admin', password: 'admin123', displayName: 'Super Admin', role: 'Super Admin' },
  { username: 'admissions', password: 'admit123', displayName: 'Admissions Officer', role: 'Admissions' },
  { username: 'finance', password: 'finance123', displayName: 'Finance Officer', role: 'Finance' },
  { username: 'finmanager', password: 'finance123', displayName: 'Finance Manager', role: 'Finance Manager' },
  { username: 'chiefaccountant', password: 'account123', displayName: 'Chief Accountant', role: 'Chief Accountant' },
  { username: 'accountant', password: 'account123', displayName: 'Accountant', role: 'Accountant' },
  { username: 'auditor', password: 'auditor123', displayName: 'Auditor', role: 'Auditor' },
  { username: 'principal', password: 'principal123', displayName: 'Principal', role: 'Principal' },
  { username: 'registrar', password: 'registrar123', displayName: 'Registrar', role: 'Registrar' }
] as const;

updateDb((db) => {
  db.users = users.map((user): UserRecord => {
    const existing = db.users.find((item) => item.username === user.username);
    return {
      id: existing?.id || crypto.randomUUID(),
      username: user.username,
      passwordHash: bcrypt.hashSync(user.password, 10),
      displayName: user.displayName,
      role: user.role,
      active: true,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
  });
});

console.log('Seeded Rawafed backend users.');
