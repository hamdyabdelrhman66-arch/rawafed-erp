import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import type { Database, SqlValue } from 'sql.js';
import { AppNotification, AuditLogRecord, DatabaseShape, FinanceAccount, FinanceExpense, FinanceInvoice, FinancePayment, RefreshTokenRecord, StaffRecord, StudentRecord, UploadedFileRecord, UserRecord } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const legacyJsonPath = join(dataDir, 'rawafed-db.json');
const sqlitePath = join(dataDir, 'rawafed.sqlite');
const wasmPath = join(__dirname, '..', 'node_modules', 'sql.js', 'dist');

const emptyDatabase: DatabaseShape = {
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
const sqlite: Database = existsSync(sqlitePath) ? new SQL.Database(readFileSync(sqlitePath)) : new SQL.Database();
let transactionDepth = 0;

sqlite.run('PRAGMA foreign_keys = ON');
runMigrations();

export function readDb(): DatabaseShape {
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

export function writeDb(next: DatabaseShape): DatabaseShape {
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
  } catch (error) {
    sqlite.run('ROLLBACK');
    throw error;
  }
  return next;
}

export function updateDb(mutator: (db: DatabaseShape) => void): DatabaseShape {
  const db = readDb();
  mutator(db);
  return writeDb(db);
}

export function logAudit(entry: Omit<AuditLogRecord, 'id' | 'createdAt'>): void {
  updateDb((db) => {
    db.auditLogs.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry
    });
  });
}

function runMigrations(): void {
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
    if (!legacy) return;
    writeDb({ ...emptyDatabase, ...legacy });
  });

  migrate(3, 'create_accounting_erp_schema', () => {
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS accounting_cost_centers (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounting_accounts (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        account_type TEXT NOT NULL,
        parent_id TEXT,
        opening_balance REAL NOT NULL DEFAULT 0,
        opening_date TEXT,
        currency TEXT NOT NULL DEFAULT 'SAR',
        cost_center_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        system_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES accounting_accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (cost_center_id) REFERENCES accounting_cost_centers(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS accounting_fiscal_years (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounting_journal_entries (
        id TEXT PRIMARY KEY,
        entry_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        reference_number TEXT,
        posting_date TEXT NOT NULL,
        description TEXT NOT NULL,
        source_type TEXT,
        source_id TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        posted_at TEXT,
        reversed_from_id TEXT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (reversed_from_id) REFERENCES accounting_journal_entries(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS accounting_journal_lines (
        id TEXT PRIMARY KEY,
        journal_entry_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        cost_center_id TEXT,
        description TEXT,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'SAR',
        created_at TEXT NOT NULL,
        FOREIGN KEY (journal_entry_id) REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounting_accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (cost_center_id) REFERENCES accounting_cost_centers(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS accounting_attachments (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        upload_id TEXT,
        file_name TEXT NOT NULL,
        url TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_accounting_accounts_parent ON accounting_accounts(parent_id);
      CREATE INDEX IF NOT EXISTS idx_accounting_accounts_type ON accounting_accounts(account_type);
      CREATE INDEX IF NOT EXISTS idx_accounting_journal_status ON accounting_journal_entries(status);
      CREATE INDEX IF NOT EXISTS idx_accounting_journal_posting ON accounting_journal_entries(posting_date);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_journal_source ON accounting_journal_entries(source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_accounting_lines_entry ON accounting_journal_lines(journal_entry_id);
      CREATE INDEX IF NOT EXISTS idx_accounting_lines_account ON accounting_journal_lines(account_id);
    `);

    seedAccountingMasterData();
    migrateExistingFinanceToAccounting();
  });

  migrate(4, 'create_supplier_purchase_expense_schema', () => {
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS accounting_suppliers (
        id TEXT PRIMARY KEY,
        supplier_code TEXT NOT NULL UNIQUE,
        name_ar TEXT,
        name_en TEXT NOT NULL,
        vat_number TEXT,
        commercial_registration TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        contact_person TEXT,
        payment_terms TEXT,
        opening_balance REAL NOT NULL DEFAULT 0,
        payable_account_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (payable_account_id) REFERENCES accounting_accounts(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS accounting_expenses (
        id TEXT PRIMARY KEY,
        expense_no TEXT NOT NULL UNIQUE,
        supplier_id TEXT,
        expense_account_id TEXT NOT NULL,
        invoice_type TEXT NOT NULL,
        supplier_invoice_number TEXT,
        description TEXT NOT NULL,
        cost_center_id TEXT,
        amount_before_vat REAL NOT NULL,
        vat_rate REAL NOT NULL,
        vat_amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        payment_status TEXT NOT NULL,
        payment_method TEXT,
        payment_from_account_id TEXT,
        journal_entry_id TEXT,
        attachment_upload_id TEXT,
        attachment_file_name TEXT,
        attachment_url TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'posted',
        expense_date TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (supplier_id) REFERENCES accounting_suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (expense_account_id) REFERENCES accounting_accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (cost_center_id) REFERENCES accounting_cost_centers(id) ON DELETE SET NULL,
        FOREIGN KEY (payment_from_account_id) REFERENCES accounting_accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (journal_entry_id) REFERENCES accounting_journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (attachment_upload_id) REFERENCES uploads(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_accounting_suppliers_code ON accounting_suppliers(supplier_code);
      CREATE INDEX IF NOT EXISTS idx_accounting_suppliers_status ON accounting_suppliers(status);
      CREATE INDEX IF NOT EXISTS idx_accounting_expenses_supplier ON accounting_expenses(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_accounting_expenses_account ON accounting_expenses(expense_account_id);
      CREATE INDEX IF NOT EXISTS idx_accounting_expenses_date ON accounting_expenses(expense_date);
      CREATE INDEX IF NOT EXISTS idx_accounting_expenses_payment_status ON accounting_expenses(payment_status);
    `);
    seedAccountingPhaseTwoAccounts();
  });

  migrate(5, 'account_master_flags_cashbox_bank_schema', () => {
    addColumnIfMissing('accounting_accounts', 'is_cash_account', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('accounting_accounts', 'is_bank_account', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('accounting_accounts', 'is_vat_account', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('accounting_accounts', 'is_receivable_account', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('accounting_accounts', 'is_payable_account', 'INTEGER NOT NULL DEFAULT 0');
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS accounting_cashboxes (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        opening_balance REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounting_accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS accounting_banks (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE,
        bank_name TEXT NOT NULL,
        iban TEXT,
        account_number TEXT,
        opening_balance REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounting_accounts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_accounting_cashboxes_status ON accounting_cashboxes(status);
      CREATE INDEX IF NOT EXISTS idx_accounting_banks_status ON accounting_banks(status);
    `);
    syncAccountingAccountFlagsAndLedgers();
  });

  migrate(6, 'create_ar_ap_master_data_schema', () => {
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS accounting_customers (
        id TEXT PRIMARY KEY,
        customer_code TEXT NOT NULL UNIQUE,
        student_id TEXT,
        registration_id TEXT,
        registration_number TEXT,
        parent_link TEXT,
        name_ar TEXT,
        name_en TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        national_id TEXT,
        opening_balance REAL NOT NULL DEFAULT 0,
        credit_limit REAL NOT NULL DEFAULT 0,
        receivable_account_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE SET NULL,
        FOREIGN KEY (receivable_account_id) REFERENCES accounting_accounts(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS ar_installment_plans (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        plan_type TEXT NOT NULL,
        name TEXT NOT NULL,
        total_amount REAL NOT NULL,
        start_date TEXT NOT NULL,
        installments_count INTEGER NOT NULL,
        late_fee_type TEXT,
        late_fee_value REAL NOT NULL DEFAULT 0,
        grace_period_days INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES accounting_customers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ar_installments (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        due_date TEXT NOT NULL,
        amount REAL NOT NULL,
        paid_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unpaid',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES ar_installment_plans(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES accounting_customers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ap_supplier_payments (
        id TEXT PRIMARY KEY,
        supplier_id TEXT NOT NULL,
        payment_no TEXT NOT NULL UNIQUE,
        payment_type TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_account_id TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        paid_at TEXT NOT NULL,
        journal_entry_id TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (supplier_id) REFERENCES accounting_suppliers(id) ON DELETE CASCADE,
        FOREIGN KEY (payment_account_id) REFERENCES accounting_accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (journal_entry_id) REFERENCES accounting_journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS ar_customer_payments (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        payment_no TEXT NOT NULL UNIQUE,
        payment_type TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_account_id TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        paid_at TEXT NOT NULL,
        journal_entry_id TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES accounting_customers(id) ON DELETE CASCADE,
        FOREIGN KEY (payment_account_id) REFERENCES accounting_accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (journal_entry_id) REFERENCES accounting_journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_accounting_customers_student ON accounting_customers(student_id);
      CREATE INDEX IF NOT EXISTS idx_accounting_customers_registration ON accounting_customers(registration_id, registration_number);
      CREATE INDEX IF NOT EXISTS idx_ar_installments_customer ON ar_installments(customer_id);
      CREATE INDEX IF NOT EXISTS idx_ar_installments_due ON ar_installments(due_date);
      CREATE INDEX IF NOT EXISTS idx_ap_supplier_payments_supplier ON ap_supplier_payments(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_ar_customer_payments_customer ON ar_customer_payments(customer_id);
    `);
  });

  migrate(7, 'create_inventory_procurement_schema', () => {
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS inventory_warehouses (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        location TEXT,
        responsible_employee TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        item_code TEXT NOT NULL UNIQUE,
        name_ar TEXT,
        name_en TEXT NOT NULL,
        category TEXT NOT NULL,
        unit TEXT NOT NULL,
        barcode TEXT,
        qr_code TEXT,
        purchase_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        vat_type TEXT NOT NULL DEFAULT 'Taxable',
        minimum_stock REAL NOT NULL DEFAULT 0,
        opening_quantity REAL NOT NULL DEFAULT 0,
        opening_value REAL NOT NULL DEFAULT 0,
        average_cost REAL NOT NULL DEFAULT 0,
        default_warehouse_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        images TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (default_warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_stock (
        item_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        average_cost REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (item_id, warehouse_id),
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        movement_no TEXT NOT NULL UNIQUE,
        movement_type TEXT NOT NULL,
        movement_date TEXT NOT NULL,
        reference_no TEXT,
        item_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        warehouse_id TEXT NOT NULL,
        to_warehouse_id TEXT,
        reason TEXT,
        attachment_upload_id TEXT,
        attachment_file_name TEXT,
        attachment_url TEXT,
        created_by TEXT,
        journal_entry_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT,
        FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE RESTRICT,
        FOREIGN KEY (to_warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (attachment_upload_id) REFERENCES uploads(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (journal_entry_id) REFERENCES accounting_journal_entries(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_requests (
        id TEXT PRIMARY KEY,
        request_no TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        reason TEXT,
        priority TEXT NOT NULL,
        expected_date TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_request_lines (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        reason TEXT,
        FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        po_number TEXT NOT NULL UNIQUE,
        request_id TEXT,
        supplier_id TEXT,
        delivery_date TEXT,
        payment_terms TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        subtotal REAL NOT NULL DEFAULT 0,
        vat_total REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES accounting_suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_order_lines (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        vat_rate REAL NOT NULL DEFAULT 15,
        vat_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        received_quantity REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS goods_receipts (
        id TEXT PRIMARY KEY,
        grn_number TEXT NOT NULL UNIQUE,
        po_id TEXT,
        supplier_id TEXT,
        warehouse_id TEXT NOT NULL,
        received_date TEXT NOT NULL,
        supplier_invoice_no TEXT,
        status TEXT NOT NULL DEFAULT 'Received',
        subtotal REAL NOT NULL DEFAULT 0,
        vat_total REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        journal_entry_id TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES accounting_suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE RESTRICT,
        FOREIGN KEY (journal_entry_id) REFERENCES accounting_journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS goods_receipt_lines (
        id TEXT PRIMARY KEY,
        grn_id TEXT NOT NULL,
        po_line_id TEXT,
        item_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        vat_rate REAL NOT NULL DEFAULT 15,
        vat_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        movement_id TEXT,
        FOREIGN KEY (grn_id) REFERENCES goods_receipts(id) ON DELETE CASCADE,
        FOREIGN KEY (po_line_id) REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT,
        FOREIGN KEY (movement_id) REFERENCES inventory_movements(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
      CREATE INDEX IF NOT EXISTS idx_inventory_stock_item ON inventory_stock(item_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(item_id);
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts(po_id);
    `);
    seedInventoryProcurementMasterData();
  });

  migrate(8, 'upgrade_chart_of_accounts_management', () => {
    addColumnIfMissing('accounting_accounts', 'normal_balance', 'TEXT');
    addColumnIfMissing('accounting_accounts', 'posting_account', 'INTEGER NOT NULL DEFAULT 1');
    sqlite.run(`
      UPDATE accounting_accounts
      SET normal_balance = CASE
        WHEN account_type IN ('asset', 'expense') THEN 'debit'
        ELSE 'credit'
      END
      WHERE normal_balance IS NULL OR normal_balance = ''
    `);
  });

  migrate(9, 'upgrade_inventory_master_data', () => {
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS inventory_categories (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name_ar TEXT,
        name_en TEXT NOT NULL,
        parent_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES inventory_categories(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_categories_parent ON inventory_categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_categories_status ON inventory_categories(status);
    `);
    addColumnIfMissing('inventory_items', 'subcategory', 'TEXT');
    addColumnIfMissing('inventory_items', 'maximum_stock', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('inventory_items', 'reorder_point', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('inventory_items', 'safety_stock', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('inventory_items', 'taxable', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing('inventory_items', 'vat_rate', 'REAL NOT NULL DEFAULT 15');
    addColumnIfMissing('inventory_items', 'supplier_id', 'TEXT');
    addColumnIfMissing('inventory_items', 'brand', 'TEXT');
    addColumnIfMissing('inventory_items', 'description', 'TEXT');
    addColumnIfMissing('inventory_items', 'notes', 'TEXT');
    addColumnIfMissing('inventory_warehouses', 'name_ar', 'TEXT');
    addColumnIfMissing('inventory_warehouses', 'name_en', 'TEXT');
    addColumnIfMissing('inventory_warehouses', 'description', 'TEXT');
    seedInventoryCategories();
  });

  ensureDefaultChartOfAccountsIfEmpty();
  persistSqlite();
}

function migrate(id: number, name: string, runner: () => void): void {
  const existing = first<{ id: number }>('SELECT id FROM migrations WHERE id = ?', [id]);
  if (existing) return;
  runner();
  sqlite.run('INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)', [id, name, new Date().toISOString()]);
}

function ensureDefaultChartOfAccountsIfEmpty(): void {
  if (!tableExists('accounting_accounts')) return;
  const existing = first<{ total: number }>('SELECT COUNT(*) AS total FROM accounting_accounts');
  if (Number(existing?.total || 0) > 0) return;

  seedAccountingMasterData();
  seedAccountingPhaseTwoAccounts();
  syncAccountingAccountFlagsAndLedgers();
  seedInventoryProcurementMasterData();
  sqlite.run(`
    UPDATE accounting_accounts
    SET normal_balance = CASE
      WHEN account_type IN ('asset', 'expense') THEN 'debit'
      ELSE 'credit'
    END
    WHERE normal_balance IS NULL OR normal_balance = ''
  `);
}

function readLegacyCollections(): Partial<DatabaseShape> | null {
  const legacy: Partial<DatabaseShape> = {};

  if (tableExists('app_collections')) {
    const result = sqlite.exec('SELECT name, value FROM app_collections');
    for (const row of result[0]?.values || []) {
      const [name, value] = row as [keyof DatabaseShape, string];
      try {
        (legacy as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        // Ignore broken legacy rows.
      }
    }
  }

  if (!Object.keys(legacy).length && existsSync(legacyJsonPath)) {
    try {
      Object.assign(legacy, JSON.parse(readFileSync(legacyJsonPath, 'utf8')) as Partial<DatabaseShape>);
    } catch {
      return null;
    }
  }

  return Object.keys(legacy).length ? legacy : null;
}

function tableExists(name: string): boolean {
  return Boolean(first('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', name]));
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = all<any>(`PRAGMA table_info(${table})`);
  if (columns.some((item) => item.name === column)) return;
  sqlite.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function selectUsers(): UserRecord[] {
  return all<any>('SELECT * FROM users ORDER BY created_at DESC').map((row) => ({
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

function replaceUsers(users: UserRecord[]): void {
  sqlite.run('DELETE FROM users');
  users.forEach((user) => sqlite.run(
    'INSERT INTO users (id, username, password_hash, display_name, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [user.id, user.username, user.passwordHash, user.displayName, user.role, user.active ? 1 : 0, user.createdAt, user.updatedAt]
  ));
}

function selectJsonRows(table: string): any[] {
  return all<any>(`SELECT data FROM ${table} ORDER BY created_at DESC`).map((row) => parseJson(row.data, {}));
}

function replaceRegistrations(registrations: any[]): void {
  sqlite.run('DELETE FROM registrations');
  registrations.forEach((registration) => sqlite.run(
    `INSERT INTO registrations (id, registration_number, status, student_name, grade, submitted_at, created_at, updated_at, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      registration.id,
      registration.registrationNumber || null,
      registration.status || 'pending',
      registration.student?.englishName || registration.student?.arabicName || null,
      registration.student?.applyingGrade || null,
      registration.submittedAt || null,
      registration.createdAt || new Date().toISOString(),
      registration.updatedAt || new Date().toISOString(),
      JSON.stringify(registration)
    ]
  ));
}

function selectStudents(): StudentRecord[] {
  return all<any>('SELECT * FROM students ORDER BY created_at DESC').map((row) => ({
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

function replaceStudents(students: StudentRecord[]): void {
  sqlite.run('DELETE FROM students');
  students.forEach((student) => sqlite.run(
    `INSERT INTO students (id, registration_id, registration_number, english_name, arabic_name, grade, national_id, passport_number, parent_name, parent_phone, parent_email, status, profile, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [student.id, student.registrationId || null, student.registrationNumber || null, student.englishName, student.arabicName || null, student.grade, student.nationalId || null, student.passportNumber || null, student.parentName || null, student.parentPhone || null, student.parentEmail || null, student.status, JSON.stringify(student.profile || {}), student.createdAt, student.updatedAt]
  ));
}

function selectNotifications(): AppNotification[] {
  return all<any>('SELECT * FROM notifications ORDER BY created_at DESC').map((row) => ({
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

function replaceNotifications(notifications: AppNotification[]): void {
  sqlite.run('DELETE FROM notifications');
  notifications.forEach((notification) => sqlite.run(
    'INSERT INTO notifications (id, message, target_roles, category, read_by, link, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [notification.id, notification.message, JSON.stringify(notification.targetRoles), notification.category, JSON.stringify(notification.readBy || []), notification.link || null, notification.sourceId || null, notification.createdAt]
  ));
}

function selectFinanceAccounts(): FinanceAccount[] {
  return all<any>('SELECT * FROM finance_accounts ORDER BY created_at DESC').map((row) => ({
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

function replaceFinanceAccounts(accounts: FinanceAccount[]): void {
  sqlite.run('DELETE FROM finance_accounts');
  accounts.forEach((account) => sqlite.run(
    `INSERT INTO finance_accounts (id, registration_id, registration_number, student_id, student_name, grade, expected_total, paid, remaining, status, fee_items, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [account.id, account.registrationId || null, account.registrationNumber || null, null, account.studentName, account.grade, account.expectedTotal, account.paid, account.remaining, account.status, JSON.stringify(account.feeItems || []), account.createdAt, account.updatedAt]
  ));
}

function selectFinancePayments(): FinancePayment[] {
  return all<any>('SELECT * FROM finance_payments ORDER BY created_at DESC').map((row) => ({
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

function replaceFinancePayments(payments: FinancePayment[]): void {
  sqlite.run('DELETE FROM finance_payments');
  payments.forEach((payment) => sqlite.run(
    `INSERT INTO finance_payments (id, account_id, registration_id, registration_number, invoice_id, receipt_number, payment_item, amount, method, paid_at, collected_by, reference_number, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payment.id, payment.accountId, payment.registrationId || null, payment.registrationNumber || null, payment.invoiceId || null, payment.receiptNumber, payment.paymentItem, payment.amount, payment.method, payment.paidAt, payment.collectedBy, payment.referenceNumber || null, payment.notes || null, payment.createdAt]
  ));
}

function selectFinanceInvoices(): FinanceInvoice[] {
  return all<any>('SELECT * FROM finance_invoices ORDER BY created_at DESC').map((row) => ({
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

function replaceFinanceInvoices(invoices: FinanceInvoice[]): void {
  sqlite.run('DELETE FROM finance_invoices');
  invoices.forEach((invoice) => sqlite.run(
    `INSERT INTO finance_invoices (id, account_id, registration_id, registration_number, invoice_number, student_name, fee_item, amount_before_vat, vat, total, paid, remaining, payment_method, status, issued_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [invoice.id, invoice.accountId || null, invoice.registrationId || null, invoice.registrationNumber || null, invoice.invoiceNumber, invoice.studentName, invoice.feeItem, invoice.amountBeforeVat, invoice.vat, invoice.total, invoice.paid, invoice.remaining, invoice.paymentMethod, invoice.status, invoice.issuedAt, invoice.createdAt]
  ));
}

function selectFinanceExpenses(): FinanceExpense[] {
  return all<any>('SELECT * FROM finance_expenses ORDER BY date DESC').map((row) => ({
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

function replaceFinanceExpenses(expenses: FinanceExpense[]): void {
  sqlite.run('DELETE FROM finance_expenses');
  expenses.forEach((expense) => sqlite.run(
    'INSERT INTO finance_expenses (id, category, title, amount, date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [expense.id, expense.category, expense.title, expense.amount, expense.date, expense.status, expense.notes || null, expense.createdAt, expense.updatedAt]
  ));
}

function selectStaff(): StaffRecord[] {
  return selectJsonRows('staff');
}

function replaceStaff(staff: StaffRecord[]): void {
  if (!tableExists('staff')) sqlite.run('CREATE TABLE staff (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL)');
  sqlite.run('DELETE FROM staff');
  staff.forEach((item) => sqlite.run('INSERT INTO staff (id, data, created_at) VALUES (?, ?, ?)', [item.id, JSON.stringify(item), item.createdAt]));
}

function selectUploads(): UploadedFileRecord[] {
  return all<any>('SELECT * FROM uploads ORDER BY created_at DESC').map((row) => ({
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

function replaceUploads(uploads: UploadedFileRecord[]): void {
  sqlite.run('DELETE FROM uploads');
  uploads.forEach((upload) => sqlite.run(
    'INSERT INTO uploads (id, original_name, file_name, mime_type, size, url, label, owner_id, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [upload.id, upload.originalName, upload.fileName, upload.mimeType, upload.size, upload.url, upload.label || null, upload.ownerId || null, upload.uploadedBy || null, upload.createdAt]
  ));
}

function selectSettings(): Record<string, unknown> {
  const row = first<{ data: string }>('SELECT data FROM settings WHERE id = 1');
  return row ? parseJson(row.data, {}) : {};
}

function replaceSettings(settings: Record<string, unknown>): void {
  sqlite.run('DELETE FROM settings');
  sqlite.run('INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)', [JSON.stringify(settings || {}), new Date().toISOString()]);
}

function selectAuditLogs(): AuditLogRecord[] {
  return all<any>('SELECT * FROM audit_logs ORDER BY created_at DESC').map((row) => ({
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

function replaceAuditLogs(logs: AuditLogRecord[]): void {
  sqlite.run('DELETE FROM audit_logs');
  logs.forEach((log) => sqlite.run(
    'INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [log.id, log.actorId || null, log.actorRole || null, log.action, log.entityType, log.entityId || null, JSON.stringify(log.details || null), log.createdAt]
  ));
}

function selectRefreshTokens(): RefreshTokenRecord[] {
  return all<any>('SELECT * FROM refresh_tokens ORDER BY created_at DESC').map((row) => ({
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || undefined,
    createdAt: row.created_at
  }));
}

function replaceRefreshTokens(tokens: RefreshTokenRecord[]): void {
  sqlite.run('DELETE FROM refresh_tokens');
  tokens.forEach((token) => sqlite.run(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [token.id, token.userId, token.tokenHash, token.expiresAt, token.revokedAt || null, token.createdAt]
  ));
}

function seedAccountingMasterData(): void {
  const now = new Date().toISOString();
  const costCenters = [
    ['cc-kg', 'KG', 'رياض الاطفال', 'KG'],
    ['cc-primary', 'PRIMARY', 'المرحلة الابتدائية', 'Primary'],
    ['cc-admin', 'ADMIN', 'الإدارة', 'Administration'],
    ['cc-transport', 'TRANSPORT', 'النقل', 'Transportation'],
    ['cc-activities', 'ACTIVITIES', 'الأنشطة', 'Activities'],
    ['cc-library', 'LIBRARY', 'المكتبة', 'Library'],
    ['cc-cafeteria', 'CAFETERIA', 'المقصف', 'Cafeteria'],
    ['cc-training', 'TRAINING', 'التدريب', 'Training']
  ];
  costCenters.forEach(([id, code, nameAr, nameEn]) => sqlite.run(
    `INSERT OR IGNORE INTO accounting_cost_centers (id, code, name_ar, name_en, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [id, code, nameAr, nameEn, now, now]
  ));

  const accounts: Array<[string, string, string, string, string, string | null, string?]> = [
    ['acc-assets', '1000', 'الأصول', 'Assets', 'asset', null],
    ['acc-current-assets', '1100', 'الأصول المتداولة', 'Current Assets', 'asset', 'acc-assets'],
    ['acc-cash', '1110', 'النقدية', 'Cash', 'asset', 'acc-current-assets', 'cash'],
    ['acc-main-cashbox', '1111', 'الصندوق الرئيسي', 'Main Cashbox', 'asset', 'acc-cash', 'main-cashbox'],
    ['acc-branch-cashbox', '1112', 'صندوق الفرع', 'Branch Cashbox', 'asset', 'acc-cash', 'branch-cashbox'],
    ['acc-bank', '1120', 'البنوك', 'Bank Accounts', 'asset', 'acc-current-assets', 'bank'],
    ['acc-card', '1125', 'مدفوعات البطاقات', 'Card Clearing', 'asset', 'acc-current-assets', 'card'],
    ['acc-petty-cash', '1130', 'العهدة النقدية', 'Petty Cash', 'asset', 'acc-current-assets', 'petty-cash'],
    ['acc-student-receivables', '1140', 'ذمم الطلاب', 'Student Receivables', 'asset', 'acc-current-assets', 'student-receivables'],
    ['acc-other-receivables', '1150', 'ذمم أخرى', 'Other Receivables', 'asset', 'acc-current-assets', 'other-receivables'],
    ['acc-employee-advances', '1160', 'سلف الموظفين', 'Employee Advances', 'asset', 'acc-current-assets', 'employee-advances'],
    ['acc-staff-custodies', '1170', 'عهد الموظفين', 'Staff Custodies', 'asset', 'acc-current-assets', 'staff-custodies'],
    ['acc-prepaid-expenses', '1180', 'مصروفات مقدمة', 'Prepaid Expenses', 'asset', 'acc-current-assets', 'prepaid-expenses'],
    ['acc-input-vat', '1190', 'ضريبة مدخلات', 'Input VAT', 'asset', 'acc-current-assets', 'input-vat'],
    ['acc-fixed-assets', '1200', 'الأصول الثابتة', 'Fixed Assets', 'asset', 'acc-assets'],
    ['acc-vehicles', '1210', 'المركبات', 'Vehicles', 'asset', 'acc-fixed-assets', 'vehicles'],
    ['acc-school-buses', '1211', 'حافلات المدرسة', 'School Buses', 'asset', 'acc-fixed-assets', 'school-buses'],
    ['acc-furniture', '1220', 'الأثاث', 'Furniture', 'asset', 'acc-fixed-assets', 'furniture'],
    ['acc-computers', '1230', 'الحاسب الآلي', 'Computers', 'asset', 'acc-fixed-assets', 'computers'],
    ['acc-liabilities', '2000', 'الالتزامات', 'Liabilities', 'liability', null],
    ['acc-current-liabilities', '2100', 'الالتزامات المتداولة', 'Current Liabilities', 'liability', 'acc-liabilities'],
    ['acc-suppliers', '2110', 'الموردون', 'Suppliers', 'liability', 'acc-current-liabilities', 'suppliers'],
    ['acc-accounts-payable', '2120', 'الدائنون', 'Accounts Payable', 'liability', 'acc-current-liabilities', 'accounts-payable'],
    ['acc-salaries-payable', '2130', 'رواتب مستحقة', 'Salaries Payable', 'liability', 'acc-current-liabilities', 'salaries-payable'],
    ['acc-vat-payable', '2140', 'ضريبة القيمة المضافة مستحقة', 'VAT Payable', 'liability', 'acc-current-liabilities', 'vat-payable'],
    ['acc-unearned-revenue', '2150', 'إيرادات غير مكتسبة', 'Unearned Revenue', 'liability', 'acc-current-liabilities', 'unearned-revenue'],
    ['acc-equity', '3000', 'حقوق الملكية', 'Equity', 'equity', null],
    ['acc-capital', '3100', 'رأس المال', 'Capital', 'equity', 'acc-equity', 'capital'],
    ['acc-retained-earnings', '3200', 'الأرباح المبقاة', 'Retained Earnings', 'equity', 'acc-equity', 'retained-earnings'],
    ['acc-current-year-profit', '3300', 'ربح السنة الحالية', 'Current Year Profit', 'equity', 'acc-equity', 'current-year-profit'],
    ['acc-revenue', '4000', 'الإيرادات', 'Revenue', 'revenue', null],
    ['acc-revenue-registration', '4010', 'إيرادات رسوم التسجيل', 'Registration Fees Revenue', 'revenue', 'acc-revenue', 'revenue-registration'],
    ['acc-revenue-tuition', '4020', 'إيرادات الرسوم الدراسية', 'Tuition Fees Revenue', 'revenue', 'acc-revenue', 'revenue-tuition'],
    ['acc-revenue-books', '4030', 'إيرادات الكتب', 'Books Revenue', 'revenue', 'acc-revenue', 'revenue-books'],
    ['acc-revenue-uniform', '4040', 'إيرادات الزي', 'Uniform Revenue', 'revenue', 'acc-revenue', 'revenue-uniform'],
    ['acc-revenue-transportation', '4050', 'إيرادات النقل', 'Transportation Revenue', 'revenue', 'acc-revenue', 'revenue-transportation'],
    ['acc-revenue-activities', '4060', 'إيرادات الأنشطة', 'Activities Revenue', 'revenue', 'acc-revenue', 'revenue-activities'],
    ['acc-revenue-graduation', '4070', 'إيرادات التخرج', 'Graduation Revenue', 'revenue', 'acc-revenue', 'revenue-graduation'],
    ['acc-revenue-trips', '4080', 'إيرادات الرحلات', 'Trips Revenue', 'revenue', 'acc-revenue', 'revenue-trips'],
    ['acc-revenue-cafeteria', '4090', 'إيرادات المقصف', 'Cafeteria Revenue', 'revenue', 'acc-revenue', 'revenue-cafeteria'],
    ['acc-revenue-other', '4190', 'إيرادات أخرى', 'Other Revenue', 'revenue', 'acc-revenue', 'revenue-other'],
    ['acc-expenses', '5000', 'المصروفات', 'Expenses', 'expense', null],
    ['acc-expense-salaries', '5010', 'مصروف الرواتب', 'Salaries Expense', 'expense', 'acc-expenses', 'expense-salaries'],
    ['acc-expense-rent', '5020', 'مصروف الإيجار', 'Rent Expense', 'expense', 'acc-expenses', 'expense-rent'],
    ['acc-expense-utilities', '5030', 'مصروف المرافق', 'Utilities Expense', 'expense', 'acc-expenses', 'expense-utilities'],
    ['acc-expense-internet', '5040', 'مصروف الإنترنت', 'Internet Expense', 'expense', 'acc-expenses', 'expense-internet'],
    ['acc-expense-fuel', '5050', 'مصروف الوقود', 'Fuel Expense', 'expense', 'acc-expenses', 'expense-fuel'],
    ['acc-expense-maintenance', '5060', 'مصروف الصيانة', 'Maintenance Expense', 'expense', 'acc-expenses', 'expense-maintenance'],
    ['acc-expense-marketing', '5070', 'مصروف التسويق', 'Marketing Expense', 'expense', 'acc-expenses', 'expense-marketing'],
    ['acc-expense-cleaning', '5080', 'مصروف النظافة', 'Cleaning Expense', 'expense', 'acc-expenses', 'expense-cleaning'],
    ['acc-expense-stationery', '5090', 'مصروف القرطاسية', 'Stationery Expense', 'expense', 'acc-expenses', 'expense-stationery'],
    ['acc-expense-office-supplies', '5100', 'مستلزمات مكتبية', 'Office Supplies Expense', 'expense', 'acc-expenses', 'expense-office-supplies'],
    ['acc-expense-bank-charges', '5110', 'مصاريف بنكية', 'Bank Charges', 'expense', 'acc-expenses', 'expense-bank-charges'],
    ['acc-expense-medical', '5120', 'مصروف طبي', 'Medical Expense', 'expense', 'acc-expenses', 'expense-medical'],
    ['acc-expense-misc', '5190', 'مصروفات متنوعة', 'Miscellaneous Expense', 'expense', 'acc-expenses', 'expense-misc']
  ];

  accounts.forEach(([id, code, nameAr, nameEn, type, parentId, systemKey]) => sqlite.run(
    `INSERT OR IGNORE INTO accounting_accounts (id, code, name_ar, name_en, account_type, parent_id, opening_balance, currency, status, notes, system_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'SAR', 'active', NULL, ?, ?, ?)`,
    [id, code, nameAr, nameEn, type, parentId, systemKey || null, now, now]
  ));

  sqlite.run(
    `INSERT OR IGNORE INTO accounting_fiscal_years (id, name, start_date, end_date, status, created_at, updated_at)
     VALUES ('fy-2026-2027', '2026-2027', '2026-07-01', '2027-06-30', 'open', ?, ?)`,
    [now, now]
  );
}

function seedAccountingPhaseTwoAccounts(): void {
  const now = new Date().toISOString();
  const accounts: Array<[string, string, string, string, string, string | null, string?]> = [
    ['acc-bank-alrajhi', '1121', 'مصرف الراجحي', 'Bank Al Rajhi', 'asset', 'acc-bank', 'bank-alrajhi'],
    ['acc-bank-alahli', '1122', 'البنك الأهلي', 'Bank Al Ahli', 'asset', 'acc-bank', 'bank-alahli'],
    ['acc-bank-riyad', '1123', 'بنك الرياض', 'Bank Riyad', 'asset', 'acc-bank', 'bank-riyad'],
    ['acc-expense-electricity', '5031', 'مصروف الكهرباء', 'Electricity Expense', 'expense', 'acc-expenses', 'expense-electricity'],
    ['acc-expense-water', '5032', 'مصروف المياه', 'Water Expense', 'expense', 'acc-expenses', 'expense-water'],
    ['acc-expense-telephone', '5041', 'مصروف الهاتف', 'Telephone Expense', 'expense', 'acc-expenses', 'expense-telephone'],
    ['acc-expense-government-fees', '5095', 'رسوم حكومية', 'Government Fees', 'expense', 'acc-expenses', 'expense-government-fees'],
    ['acc-expense-social-insurance', '5096', 'تأمينات اجتماعية', 'Social Insurance Expense', 'expense', 'acc-expenses', 'expense-social-insurance'],
    ['acc-expense-insurance', '5097', 'مصروف التأمين', 'Insurance Expense', 'expense', 'acc-expenses', 'expense-insurance'],
    ['acc-expense-hospitality', '5098', 'ضيافة', 'Hospitality Expense', 'expense', 'acc-expenses', 'expense-hospitality'],
    ['acc-expense-software', '5105', 'اشتراكات وبرامج', 'Software Subscriptions', 'expense', 'acc-expenses', 'expense-software'],
    ['acc-expense-furniture-purchase', '5130', 'شراء أثاث', 'Furniture Purchase', 'expense', 'acc-expenses', 'expense-furniture-purchase'],
    ['acc-expense-devices-purchase', '5140', 'شراء أجهزة', 'Devices Purchase', 'expense', 'acc-expenses', 'expense-devices-purchase'],
    ['acc-expense-building-maintenance', '5150', 'صيانة مباني', 'Building Maintenance', 'expense', 'acc-expenses', 'expense-building-maintenance'],
    ['acc-expense-transportation', '5160', 'مصروفات النقل', 'Transportation Expenses', 'expense', 'acc-expenses', 'expense-transportation'],
    ['acc-expense-school-activities', '5170', 'مصروفات الأنشطة المدرسية', 'School Activities Expenses', 'expense', 'acc-expenses', 'expense-school-activities'],
    ['acc-expense-books-purchase', '5180', 'شراء كتب', 'Books Purchase', 'expense', 'acc-expenses', 'expense-books-purchase'],
    ['acc-expense-uniform-purchase', '5185', 'شراء زي مدرسي', 'Uniform Purchase', 'expense', 'acc-expenses', 'expense-uniform-purchase']
  ];

  accounts.forEach(([id, code, nameAr, nameEn, type, parentId, systemKey]) => sqlite.run(
    `INSERT OR IGNORE INTO accounting_accounts (id, code, name_ar, name_en, account_type, parent_id, opening_balance, currency, status, notes, system_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'SAR', 'active', NULL, ?, ?, ?)`,
    [id, code, nameAr, nameEn, type, parentId, systemKey || null, now, now]
  ));
}

function syncAccountingAccountFlagsAndLedgers(): void {
  const now = new Date().toISOString();
  const cashKeys = ['main-cashbox', 'branch-cashbox', 'petty-cash'];
  const bankKeys = ['bank', 'bank-alrajhi', 'bank-alahli', 'bank-riyad', 'card'];
  const vatKeys = ['input-vat', 'vat-payable'];
  const receivableKeys = ['student-receivables', 'other-receivables'];
  const payableKeys = ['suppliers', 'accounts-payable', 'salaries-payable'];

  sqlite.run('UPDATE accounting_accounts SET is_cash_account = 0, is_bank_account = 0, is_vat_account = 0, is_receivable_account = 0, is_payable_account = 0');
  setFlagForKeys('is_cash_account', cashKeys);
  setFlagForKeys('is_bank_account', bankKeys);
  setFlagForKeys('is_vat_account', vatKeys);
  setFlagForKeys('is_receivable_account', receivableKeys);
  setFlagForKeys('is_payable_account', payableKeys);

  [
    ['cashbox-main', 'main-cashbox', 'Main Cashbox'],
    ['cashbox-petty', 'petty-cash', 'Petty Cash']
  ].forEach(([id, key, name]) => {
    const account = first<{ id: string; opening_balance: number }>('SELECT id, opening_balance FROM accounting_accounts WHERE system_key = ?', [key]);
    if (!account) return;
    sqlite.run(
      `INSERT OR IGNORE INTO accounting_cashboxes (id, account_id, name, opening_balance, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      [id, account.id, name, Number(account.opening_balance || 0), now, now]
    );
  });

  [
    ['bank-alrajhi', 'bank-alrajhi', 'Bank Al Rajhi'],
    ['bank-alahli', 'bank-alahli', 'Bank Al Ahli'],
    ['bank-riyad', 'bank-riyad', 'Bank Riyad']
  ].forEach(([id, key, name]) => {
    const account = first<{ id: string; opening_balance: number }>('SELECT id, opening_balance FROM accounting_accounts WHERE system_key = ?', [key]);
    if (!account) return;
    sqlite.run(
      `INSERT OR IGNORE INTO accounting_banks (id, account_id, bank_name, opening_balance, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      [id, account.id, name, Number(account.opening_balance || 0), now, now]
    );
  });
}

function seedInventoryProcurementMasterData(): void {
  const now = new Date().toISOString();
  const accounts: Array<[string, string, string, string, string, string | null, string?]> = [
    ['acc-inventory', '1195', 'المخزون', 'Inventory', 'asset', 'acc-current-assets', 'inventory'],
    ['acc-cogs', '5200', 'تكلفة البضاعة المباعة', 'Cost of Goods Sold', 'expense', 'acc-expenses', 'cost-of-goods-sold'],
    ['acc-stock-adjustment-loss', '5210', 'خسائر تسوية المخزون', 'Stock Adjustment Loss', 'expense', 'acc-expenses', 'stock-adjustment-loss'],
    ['acc-stock-adjustment-gain', '4200', 'أرباح تسوية المخزون', 'Stock Adjustment Gain', 'revenue', 'acc-revenue', 'stock-adjustment-gain']
  ];
  accounts.forEach(([id, code, nameAr, nameEn, type, parentId, systemKey]) => sqlite.run(
    `INSERT OR IGNORE INTO accounting_accounts (id, code, name_ar, name_en, account_type, parent_id, opening_balance, currency, status, notes, system_key, is_cash_account, is_bank_account, is_vat_account, is_receivable_account, is_payable_account, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'SAR', 'active', NULL, ?, 0, 0, 0, 0, 0, ?, ?)`,
    [id, code, nameAr, nameEn, type, parentId, systemKey || null, now, now]
  ));

  const warehouses = [
    ['wh-main', 'MAIN', 'Main Warehouse', 'Campus main storage'],
    ['wh-books', 'BOOKS', 'Books Store', 'Books storage'],
    ['wh-uniform', 'UNIFORM', 'Uniform Store', 'Uniform storage'],
    ['wh-it', 'IT', 'IT Store', 'Devices and IT equipment'],
    ['wh-maintenance', 'MAINT', 'Maintenance Store', 'Maintenance materials'],
    ['wh-cleaning', 'CLEAN', 'Cleaning Store', 'Cleaning supplies'],
    ['wh-branch', 'BRANCH', 'Branch Stores', 'Branch storage']
  ];
  warehouses.forEach(([id, code, name, location]) => sqlite.run(
    `INSERT OR IGNORE INTO inventory_warehouses (id, code, name, location, responsible_employee, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)`,
    [id, code, name, location, now, now]
  ));
}

function seedInventoryCategories(): void {
  const now = new Date().toISOString();
  const categories: Array<[string, string, string, string, string | null]> = [
    ['cat-books', 'BOOKS', 'الكتب', 'Books', null],
    ['cat-books-english', 'BOOKS-EN', 'اللغة الإنجليزية', 'English', 'cat-books'],
    ['cat-books-math', 'BOOKS-MATH', 'الرياضيات', 'Math', 'cat-books'],
    ['cat-books-science', 'BOOKS-SCI', 'العلوم', 'Science', 'cat-books'],
    ['cat-uniform', 'UNIFORM', 'الزي المدرسي', 'Uniform', null],
    ['cat-uniform-boys', 'UNIFORM-BOYS', 'بنين', 'Boys', 'cat-uniform'],
    ['cat-uniform-girls', 'UNIFORM-GIRLS', 'بنات', 'Girls', 'cat-uniform'],
    ['cat-uniform-summer', 'UNIFORM-SUMMER', 'صيفي', 'Summer', 'cat-uniform'],
    ['cat-uniform-winter', 'UNIFORM-WINTER', 'شتوي', 'Winter', 'cat-uniform'],
    ['cat-cleaning', 'CLEANING', 'النظافة', 'Cleaning', null],
    ['cat-it', 'IT', 'تقنية المعلومات', 'IT Equipment', null],
    ['cat-furniture', 'FURNITURE', 'الأثاث', 'Furniture', null],
    ['cat-medical', 'MEDICAL', 'طبي', 'Medical', null],
    ['cat-sports', 'SPORTS', 'الرياضة', 'Sports', null],
    ['cat-lab', 'LAB', 'المختبر', 'Laboratory', null],
    ['cat-stationery', 'STATIONERY', 'القرطاسية', 'Stationery', null]
  ];
  categories.forEach(([id, code, nameAr, nameEn, parentId]) => sqlite.run(
    `INSERT OR IGNORE INTO inventory_categories (id, code, name_ar, name_en, parent_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    [id, code, nameAr, nameEn, parentId, now, now]
  ));
}

function setFlagForKeys(flag: string, keys: string[]): void {
  const placeholders = keys.map(() => '?').join(',');
  sqlite.run(`UPDATE accounting_accounts SET ${flag} = 1 WHERE system_key IN (${placeholders})`, keys);
}

function migrateExistingFinanceToAccounting(): void {
  const payments = selectFinancePayments();
  const invoices = selectFinanceInvoices();
  const expenses = selectFinanceExpenses();

  invoices.forEach((invoice) => {
    if (first('SELECT id FROM accounting_journal_entries WHERE source_type = ? AND source_id = ?', ['finance_invoice', invoice.id])) return;
    const lines = [
      { accountId: accountIdByKey('student-receivables'), debit: invoice.total, credit: 0, description: invoice.invoiceNumber },
      { accountId: revenueAccountIdForItem(invoice.feeItem), debit: 0, credit: invoice.amountBeforeVat, description: invoice.feeItem }
    ];
    if (invoice.vat > 0) lines.push({ accountId: accountIdByKey('vat-payable'), debit: 0, credit: invoice.vat, description: 'Output VAT' });
    insertPostedJournal(`AUTO-SI-${invoice.invoiceNumber}`, invoice.issuedAt, `Sales invoice ${invoice.invoiceNumber}`, 'finance_invoice', invoice.id, lines);
  });

  payments.forEach((payment) => {
    if (first('SELECT id FROM accounting_journal_entries WHERE source_type = ? AND source_id = ?', ['finance_payment', payment.id])) return;
    insertPostedJournal(`AUTO-RV-${payment.receiptNumber}`, payment.paidAt, `Receipt ${payment.receiptNumber}`, 'finance_payment', payment.id, [
      { accountId: cashAccountIdForMethod(payment.method), debit: payment.amount, credit: 0, description: payment.method },
      { accountId: accountIdByKey('student-receivables'), debit: 0, credit: payment.amount, description: payment.paymentItem }
    ]);
  });

  expenses.forEach((expense) => {
    if (first('SELECT id FROM accounting_journal_entries WHERE source_type = ? AND source_id = ?', ['finance_expense', expense.id])) return;
    const detail = parseJson<any>(expense.notes, {});
    const vat = Number(detail.vatAmount || 0);
    const amountBeforeVat = Number(detail.amountBeforeVat || expense.amount - vat);
    const lines = [
      { accountId: expenseAccountIdForCategory(expense.category), debit: amountBeforeVat, credit: 0, description: expense.title }
    ];
    if (vat > 0) lines.push({ accountId: accountIdByKey('input-vat'), debit: vat, credit: 0, description: 'Input VAT' });
    lines.push({ accountId: cashAccountIdForMethod(detail.method || 'Cash'), debit: 0, credit: expense.amount, description: expense.status });
    insertPostedJournal(`AUTO-PV-${expense.id.slice(0, 8)}`, expense.date, `Purchase / expense ${expense.title}`, 'finance_expense', expense.id, lines);
  });
}

function insertPostedJournal(
  entryNumber: string,
  postingDate: string,
  description: string,
  sourceType: string,
  sourceId: string,
  lines: Array<{ accountId: string; debit: number; credit: number; description?: string }>
): string {
  const debit = moneySum(lines.map((line) => line.debit));
  const credit = moneySum(lines.map((line) => line.credit));
  if (Math.abs(debit - credit) > 0.01) throw new Error(`Unbalanced journal entry ${entryNumber}`);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  sqlite.run(
    `INSERT INTO accounting_journal_entries (id, entry_number, status, reference_number, posting_date, description, source_type, source_id, created_at, updated_at, posted_at)
     VALUES (?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, uniqueEntryNumber(entryNumber), entryNumber, postingDate.slice(0, 10), description, sourceType, sourceId, now, now, now]
  );
  lines.forEach((line) => sqlite.run(
    `INSERT INTO accounting_journal_lines (id, journal_entry_id, account_id, description, debit, credit, currency, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'SAR', ?)`,
    [crypto.randomUUID(), id, line.accountId, line.description || description, roundMoney(line.debit), roundMoney(line.credit), now]
  ));
  return id;
}

function uniqueEntryNumber(base: string): string {
  let value = base;
  let index = 1;
  while (first('SELECT id FROM accounting_journal_entries WHERE entry_number = ?', [value])) {
    index += 1;
    value = `${base}-${index}`;
  }
  return value;
}

function revenueAccountIdForItem(item: string): string {
  const text = String(item || '').toLowerCase();
  if (text.includes('registration')) return accountIdByKey('revenue-registration');
  if (text.includes('book')) return accountIdByKey('revenue-books');
  if (text.includes('uniform')) return accountIdByKey('revenue-uniform');
  if (text.includes('bus') || text.includes('transport')) return accountIdByKey('revenue-transportation');
  if (text.includes('activit')) return accountIdByKey('revenue-activities');
  if (text.includes('graduation')) return accountIdByKey('revenue-graduation');
  if (text.includes('trip')) return accountIdByKey('revenue-trips');
  return accountIdByKey('revenue-tuition');
}

function expenseAccountIdForCategory(category: string): string {
  const text = String(category || '').toLowerCase();
  if (text.includes('salary')) return accountIdByKey('expense-salaries');
  if (text.includes('rent')) return accountIdByKey('expense-rent');
  if (text.includes('util')) return accountIdByKey('expense-utilities');
  if (text.includes('internet')) return accountIdByKey('expense-internet');
  if (text.includes('fuel')) return accountIdByKey('expense-fuel');
  if (text.includes('maintenance')) return accountIdByKey('expense-maintenance');
  if (text.includes('marketing')) return accountIdByKey('expense-marketing');
  if (text.includes('clean')) return accountIdByKey('expense-cleaning');
  if (text.includes('station')) return accountIdByKey('expense-stationery');
  if (text.includes('office') || text.includes('supplies') || text.includes('purchase')) return accountIdByKey('expense-office-supplies');
  if (text.includes('bank')) return accountIdByKey('expense-bank-charges');
  if (text.includes('medical')) return accountIdByKey('expense-medical');
  return accountIdByKey('expense-misc');
}

function cashAccountIdForMethod(method: string): string {
  const text = String(method || '').toLowerCase();
  if (text.includes('bank') || text.includes('transfer')) return accountIdByKey('bank');
  if (text.includes('card') || text.includes('online')) return accountIdByKey('card');
  return accountIdByKey('main-cashbox');
}

function accountIdByKey(systemKey: string): string {
  const account = first<{ id: string }>('SELECT id FROM accounting_accounts WHERE system_key = ?', [systemKey]);
  if (!account) throw new Error(`Missing accounting account ${systemKey}`);
  return account.id;
}

function moneySum(values: number[]): number {
  return values.reduce((sum, value) => roundMoney(sum + Number(value || 0)), 0);
}

function roundMoney(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function dbAll<T>(sql: string, params: SqlValue[] = []): T[] {
  return all<T>(sql, params);
}

export function dbFirst<T>(sql: string, params: SqlValue[] = []): T | undefined {
  return first<T>(sql, params);
}

export function dbRun(sql: string, params: SqlValue[] = []): void {
  sqlite.run(sql, params);
  if (transactionDepth === 0) persistSqlite();
}

export function dbTransaction<T>(runner: () => T): T {
  sqlite.run('BEGIN TRANSACTION');
  transactionDepth += 1;
  try {
    const result = runner();
    sqlite.run('COMMIT');
    transactionDepth -= 1;
    persistSqlite();
    return result;
  } catch (error) {
    sqlite.run('ROLLBACK');
    transactionDepth -= 1;
    throw error;
  }
}

function all<T>(sql: string, params: SqlValue[] = []): T[] {
  const stmt = sqlite.prepare(sql);
  const rows: T[] = [];
  try {
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
  } finally {
    stmt.free();
  }
  return rows;
}

function first<T>(sql: string, params: SqlValue[] = []): T | undefined {
  return all<T>(sql, params)[0];
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    if (value === null || value === undefined || value === '') return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function persistSqlite(): void {
  writeFileSync(sqlitePath, Buffer.from(sqlite.export()));
}
