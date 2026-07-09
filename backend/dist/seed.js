import bcrypt from 'bcryptjs';
import { updateDb } from './db.js';
const now = new Date().toISOString();
const users = [
    { username: 'admin', password: 'admin123', displayName: 'Super Admin', role: 'Super Admin' },
    { username: 'admissions', password: 'admit123', displayName: 'Admissions Officer', role: 'Admissions' },
    { username: 'finance', password: 'finance123', displayName: 'Finance Officer', role: 'Finance' },
    { username: 'principal', password: 'principal123', displayName: 'Principal', role: 'Principal' },
    { username: 'registrar', password: 'registrar123', displayName: 'Registrar', role: 'Registrar' }
];
updateDb((db) => {
    db.users = users.map((user) => {
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
