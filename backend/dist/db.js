import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const legacyJsonPath = join(dataDir, 'rawafed-db.json');
const sqlitePath = join(dataDir, 'rawafed.sqlite');
const wasmPath = join(__dirname, '..', 'node_modules', 'sql.js', 'dist');
const emptyDatabase = {
    users: [],
    registrations: [],
    students: [],
    notifications: [],
    financeAccounts: [],
    financePayments: [],
    financeInvoices: [],
    financeExpenses: [],
    staff: [],
    uploads: [],
    settings: {},
    auditLogs: [],
    refreshTokens: []
};
mkdirSync(dataDir, { recursive: true });
const SQL = await initSqlJs({ locateFile: (file) => join(wasmPath, file) });
const sqlite = existsSync(sqlitePath) ? new SQL.Database(readFileSync(sqlitePath)) : new SQL.Database();
sqlite.run('PRAGMA foreign_keys = ON');
runMigrations();
export function readDb() {
    return {
        users: selectUsers(),
        registrations: selectJsonRows('registrations'),
        students: selectStudents(),
        notifications: selectNotifications(),
        financeAccounts: selectFinanceAccounts(),
        financePayments: selectFinancePayments(),
        financeInvoices: selectFinanceInvoices(),
        financeExpenses: selectFinanceExpenses(),
        staff: selectStaff(),
        uploads: selectUploads(),
        settings: selectSettings(),
        auditLogs: selectAuditLogs(),
        refreshTokens: selectRefreshTokens()
    };
}
export function writeDb(next) {
    sqlite.run('BEGIN TRANSACTION');
    try {
        replaceUsers(next.users);
        replaceRegistrations(next.registrations);
        replaceStudents(next.students);
        replaceNotifications(next.notifications);
        replaceFinanceAccounts(next.financeAccounts);
        replaceFinancePayments(next.financePayments);
        replaceFinanceInvoices(next.financeInvoices);
        replaceFinanceExpenses(next.financeExpenses);
        replaceStaff(next.staff);
        replaceUploads(next.uploads);
        replaceSettings(next.settings);
        replaceAuditLogs(next.auditLogs);
        replaceRefreshTokens(next.refreshTokens);
        sqlite.run('COMMIT');
        persistSqlite();
    }
    catch (error) {
        sqlite.run('ROLLBACK');
        throw error;
    }
    return next;
}
export function updateDb(mutator) {
    const db = readDb();
    mutator(db);
    return writeDb(db);
}
export function logAudit(entry) {
    updateDb((db) => {
        db.auditLogs.unshift({
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            ...entry
        });
    });
}
function runMigrations() {
    sqlite.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);
    migrate(1, 'create_relational_schema', () => {
        sqlite.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        registration_number TEXT UNIQUE,
        status TEXT NOT NULL,
        student_name TEXT,
        grade TEXT,
        submitted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        registration_id TEXT UNIQUE,
        registration_number TEXT,
        english_name TEXT NOT NULL,
        arabic_name TEXT,
        grade TEXT NOT NULL,
        national_id TEXT,
        passport_number TEXT,
        parent_name TEXT,
        parent_phone TEXT,
        parent_email TEXT,
        status TEXT NOT NULL,
        profile TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS finance_accounts (
        id TEXT PRIMARY KEY,
        registration_id TEXT,
        registration_number TEXT,
        student_id TEXT,
        student_name TEXT NOT NULL,
        grade TEXT,
        expected_total REAL NOT NULL,
        paid REAL NOT NULL,
        remaining REAL NOT NULL,
        status TEXT NOT NULL,
        fee_items TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE SET NULL,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS finance_payments (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        registration_id TEXT,
        registration_number TEXT,
        invoice_id TEXT,
        receipt_number TEXT NOT NULL UNIQUE,
        payment_item TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        paid_at TEXT NOT NULL,
        collected_by TEXT NOT NULL,
        reference_number TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES finance_accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE SET NULL,
        FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS finance_invoices (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        registration_id TEXT,
        registration_number TEXT,
        invoice_number TEXT NOT NULL UNIQUE,
        student_name TEXT NOT NULL,
        fee_item TEXT NOT NULL,
        amount_before_vat REAL NOT NULL,
        vat REAL NOT NULL,
        total REAL NOT NULL,
        paid REAL NOT NULL,
        remaining REAL NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES finance_accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS finance_expenses (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        file_name TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        url TEXT NOT NULL,
        label TEXT,
        owner_id TEXT,
        uploaded_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        message TEXT NOT NULL,
        target_roles TEXT NOT NULL,
        category TEXT NOT NULL,
        read_by TEXT NOT NULL,
        link TEXT,
        source_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
      CREATE INDEX IF NOT EXISTS idx_registrations_number ON registrations(registration_number);
      CREATE INDEX IF NOT EXISTS idx_students_registration ON students(registration_id);
      CREATE INDEX IF NOT EXISTS idx_students_grade ON students(grade);
      CREATE INDEX IF NOT EXISTS idx_finance_accounts_registration ON finance_accounts(registration_id);
      CREATE INDEX IF NOT EXISTS idx_finance_accounts_status ON finance_accounts(status);
      CREATE INDEX IF NOT EXISTS idx_finance_payments_account ON finance_payments(account_id);
      CREATE INDEX IF NOT EXISTS idx_finance_payments_paid_at ON finance_payments(paid_at);
      CREATE INDEX IF NOT EXISTS idx_finance_invoices_account ON finance_invoices(account_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON finance_expenses(date);
      CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    `);
    });
    migrate(2, 'migrate_legacy_collections', () => {
        const legacy = readLegacyCollections();
        if (!legacy)
            return;
        writeDb({ ...emptyDatabase, ...legacy });
    });
    persistSqlite();
}
function migrate(id, name, runner) {
    const existing = first('SELECT id FROM migrations WHERE id = ?', [id]);
    if (existing)
        return;
    runner();
    sqlite.run('INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)', [id, name, new Date().toISOString()]);
}
function readLegacyCollections() {
    const legacy = {};
    if (tableExists('app_collections')) {
        const result = sqlite.exec('SELECT name, value FROM app_collections');
        for (const row of result[0]?.values || []) {
            const [name, value] = row;
            try {
                legacy[name] = JSON.parse(value);
            }
            catch {
                // Ignore broken legacy rows.
            }
        }
    }
    if (!Object.keys(legacy).length && existsSync(legacyJsonPath)) {
        try {
            Object.assign(legacy, JSON.parse(readFileSync(legacyJsonPath, 'utf8')));
        }
        catch {
            return null;
        }
    }
    return Object.keys(legacy).length ? legacy : null;
}
function tableExists(name) {
    return Boolean(first('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', name]));
}
function selectUsers() {
    return all('SELECT * FROM users ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        displayName: row.display_name,
        role: row.role,
        active: Boolean(row.active),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}
function replaceUsers(users) {
    sqlite.run('DELETE FROM users');
    users.forEach((user) => sqlite.run('INSERT INTO users (id, username, password_hash, display_name, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [user.id, user.username, user.passwordHash, user.displayName, user.role, user.active ? 1 : 0, user.createdAt, user.updatedAt]));
}
function selectJsonRows(table) {
    return all(`SELECT data FROM ${table} ORDER BY created_at DESC`).map((row) => parseJson(row.data, {}));
}
function replaceRegistrations(registrations) {
    sqlite.run('DELETE FROM registrations');
    registrations.forEach((registration) => sqlite.run(`INSERT INTO registrations (id, registration_number, status, student_name, grade, submitted_at, created_at, updated_at, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        registration.id,
        registration.registrationNumber || null,
        registration.status || 'pending',
        registration.student?.englishName || registration.student?.arabicName || null,
        registration.student?.applyingGrade || null,
        registration.submittedAt || null,
        registration.createdAt || new Date().toISOString(),
        registration.updatedAt || new Date().toISOString(),
        JSON.stringify(registration)
    ]));
}
function selectStudents() {
    return all('SELECT * FROM students ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        registrationId: row.registration_id || undefined,
        registrationNumber: row.registration_number || undefined,
        englishName: row.english_name,
        arabicName: row.arabic_name || undefined,
        grade: row.grade,
        nationalId: row.national_id || undefined,
        passportNumber: row.passport_number || undefined,
        parentName: row.parent_name || undefined,
        parentPhone: row.parent_phone || undefined,
        parentEmail: row.parent_email || undefined,
        status: row.status,
        profile: parseJson(row.profile, {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}
function replaceStudents(students) {
    sqlite.run('DELETE FROM students');
    students.forEach((student) => sqlite.run(`INSERT INTO students (id, registration_id, registration_number, english_name, arabic_name, grade, national_id, passport_number, parent_name, parent_phone, parent_email, status, profile, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [student.id, student.registrationId || null, student.registrationNumber || null, student.englishName, student.arabicName || null, student.grade, student.nationalId || null, student.passportNumber || null, student.parentName || null, student.parentPhone || null, student.parentEmail || null, student.status, JSON.stringify(student.profile || {}), student.createdAt, student.updatedAt]));
}
function selectNotifications() {
    return all('SELECT * FROM notifications ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        message: row.message,
        targetRoles: parseJson(row.target_roles, 'all'),
        category: row.category,
        createdAt: row.created_at,
        readBy: parseJson(row.read_by, []),
        link: row.link || undefined,
        sourceId: row.source_id || undefined
    }));
}
function replaceNotifications(notifications) {
    sqlite.run('DELETE FROM notifications');
    notifications.forEach((notification) => sqlite.run('INSERT INTO notifications (id, message, target_roles, category, read_by, link, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [notification.id, notification.message, JSON.stringify(notification.targetRoles), notification.category, JSON.stringify(notification.readBy || []), notification.link || null, notification.sourceId || null, notification.createdAt]));
}
function selectFinanceAccounts() {
    return all('SELECT * FROM finance_accounts ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        registrationId: row.registration_id || '',
        registrationNumber: row.registration_number || '',
        studentName: row.student_name,
        grade: row.grade || '',
        expectedTotal: Number(row.expected_total || 0),
        paid: Number(row.paid || 0),
        remaining: Number(row.remaining || 0),
        status: row.status,
        feeItems: parseJson(row.fee_items, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}
function replaceFinanceAccounts(accounts) {
    sqlite.run('DELETE FROM finance_accounts');
    accounts.forEach((account) => sqlite.run(`INSERT INTO finance_accounts (id, registration_id, registration_number, student_id, student_name, grade, expected_total, paid, remaining, status, fee_items, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [account.id, account.registrationId || null, account.registrationNumber || null, null, account.studentName, account.grade, account.expectedTotal, account.paid, account.remaining, account.status, JSON.stringify(account.feeItems || []), account.createdAt, account.updatedAt]));
}
function selectFinancePayments() {
    return all('SELECT * FROM finance_payments ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        accountId: row.account_id,
        registrationId: row.registration_id || undefined,
        registrationNumber: row.registration_number || undefined,
        receiptNumber: row.receipt_number,
        paymentItem: row.payment_item,
        amount: Number(row.amount || 0),
        method: row.method,
        paidAt: row.paid_at,
        collectedBy: row.collected_by,
        referenceNumber: row.reference_number || undefined,
        notes: row.notes || undefined,
        invoiceId: row.invoice_id || undefined,
        createdAt: row.created_at
    }));
}
function replaceFinancePayments(payments) {
    sqlite.run('DELETE FROM finance_payments');
    payments.forEach((payment) => sqlite.run(`INSERT INTO finance_payments (id, account_id, registration_id, registration_number, invoice_id, receipt_number, payment_item, amount, method, paid_at, collected_by, reference_number, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [payment.id, payment.accountId, payment.registrationId || null, payment.registrationNumber || null, payment.invoiceId || null, payment.receiptNumber, payment.paymentItem, payment.amount, payment.method, payment.paidAt, payment.collectedBy, payment.referenceNumber || null, payment.notes || null, payment.createdAt]));
}
function selectFinanceInvoices() {
    return all('SELECT * FROM finance_invoices ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        accountId: row.account_id || undefined,
        registrationId: row.registration_id || undefined,
        registrationNumber: row.registration_number || undefined,
        invoiceNumber: row.invoice_number,
        studentName: row.student_name,
        feeItem: row.fee_item,
        amountBeforeVat: Number(row.amount_before_vat || 0),
        vat: Number(row.vat || 0),
        total: Number(row.total || 0),
        paid: Number(row.paid || 0),
        remaining: Number(row.remaining || 0),
        paymentMethod: row.payment_method,
        status: row.status,
        issuedAt: row.issued_at,
        createdAt: row.created_at
    }));
}
function replaceFinanceInvoices(invoices) {
    sqlite.run('DELETE FROM finance_invoices');
    invoices.forEach((invoice) => sqlite.run(`INSERT INTO finance_invoices (id, account_id, registration_id, registration_number, invoice_number, student_name, fee_item, amount_before_vat, vat, total, paid, remaining, payment_method, status, issued_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [invoice.id, invoice.accountId || null, invoice.registrationId || null, invoice.registrationNumber || null, invoice.invoiceNumber, invoice.studentName, invoice.feeItem, invoice.amountBeforeVat, invoice.vat, invoice.total, invoice.paid, invoice.remaining, invoice.paymentMethod, invoice.status, invoice.issuedAt, invoice.createdAt]));
}
function selectFinanceExpenses() {
    return all('SELECT * FROM finance_expenses ORDER BY date DESC').map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        amount: Number(row.amount || 0),
        date: row.date,
        status: row.status,
        notes: row.notes || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}
function replaceFinanceExpenses(expenses) {
    sqlite.run('DELETE FROM finance_expenses');
    expenses.forEach((expense) => sqlite.run('INSERT INTO finance_expenses (id, category, title, amount, date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [expense.id, expense.category, expense.title, expense.amount, expense.date, expense.status, expense.notes || null, expense.createdAt, expense.updatedAt]));
}
function selectStaff() {
    return selectJsonRows('staff');
}
function replaceStaff(staff) {
    if (!tableExists('staff'))
        sqlite.run('CREATE TABLE staff (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL)');
    sqlite.run('DELETE FROM staff');
    staff.forEach((item) => sqlite.run('INSERT INTO staff (id, data, created_at) VALUES (?, ?, ?)', [item.id, JSON.stringify(item), item.createdAt]));
}
function selectUploads() {
    return all('SELECT * FROM uploads ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        originalName: row.original_name,
        fileName: row.file_name,
        mimeType: row.mime_type,
        size: Number(row.size || 0),
        url: row.url,
        label: row.label || undefined,
        ownerId: row.owner_id || undefined,
        uploadedBy: row.uploaded_by || undefined,
        createdAt: row.created_at
    }));
}
function replaceUploads(uploads) {
    sqlite.run('DELETE FROM uploads');
    uploads.forEach((upload) => sqlite.run('INSERT INTO uploads (id, original_name, file_name, mime_type, size, url, label, owner_id, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [upload.id, upload.originalName, upload.fileName, upload.mimeType, upload.size, upload.url, upload.label || null, upload.ownerId || null, upload.uploadedBy || null, upload.createdAt]));
}
function selectSettings() {
    const row = first('SELECT data FROM settings WHERE id = 1');
    return row ? parseJson(row.data, {}) : {};
}
function replaceSettings(settings) {
    sqlite.run('DELETE FROM settings');
    sqlite.run('INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)', [JSON.stringify(settings || {}), new Date().toISOString()]);
}
function selectAuditLogs() {
    return all('SELECT * FROM audit_logs ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        actorId: row.actor_id || undefined,
        actorRole: row.actor_role || undefined,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id || undefined,
        details: parseJson(row.details, undefined),
        createdAt: row.created_at
    }));
}
function replaceAuditLogs(logs) {
    sqlite.run('DELETE FROM audit_logs');
    logs.forEach((log) => sqlite.run('INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [log.id, log.actorId || null, log.actorRole || null, log.action, log.entityType, log.entityId || null, JSON.stringify(log.details || null), log.createdAt]));
}
function selectRefreshTokens() {
    return all('SELECT * FROM refresh_tokens ORDER BY created_at DESC').map((row) => ({
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at || undefined,
        createdAt: row.created_at
    }));
}
function replaceRefreshTokens(tokens) {
    sqlite.run('DELETE FROM refresh_tokens');
    tokens.forEach((token) => sqlite.run('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [token.id, token.userId, token.tokenHash, token.expiresAt, token.revokedAt || null, token.createdAt]));
}
function all(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    const rows = [];
    try {
        stmt.bind(params);
        while (stmt.step())
            rows.push(stmt.getAsObject());
    }
    finally {
        stmt.free();
    }
    return rows;
}
function first(sql, params = []) {
    return all(sql, params)[0];
}
function parseJson(value, fallback) {
    try {
        if (value === null || value === undefined || value === '')
            return fallback;
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function persistSqlite() {
    writeFileSync(sqlitePath, Buffer.from(sqlite.export()));
}
