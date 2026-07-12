import { randomUUID } from 'node:crypto';
import { dbAll, dbFirst, dbRun, dbTransaction, readDb } from './db.js';

export interface AccountingActor {
  id?: string;
  name?: string;
}

export interface JournalLineInput {
  accountId: string;
  costCenterId?: string;
  description?: string;
  debit?: number;
  credit?: number;
}

export interface JournalEntryInput {
  referenceNumber?: string;
  postingDate: string;
  description: string;
  sourceType?: string;
  sourceId?: string;
  status?: 'draft' | 'posted';
  lines: JournalLineInput[];
}

export interface TrialBalanceOptions {
  fromDate?: string;
  toDate?: string;
  displayMode?: 'activity' | 'balance' | 'all';
  accountType?: string;
  parentAccountId?: string;
  branch?: string;
  costCenterId?: string;
  currency?: string;
  accountStatus?: string;
  search?: string;
  showZeroBalances?: boolean;
  showParentAccounts?: boolean;
}

export function listAccounts(): any[] {
  const accounts = dbAll<any>(`
    SELECT a.*, p.code AS parent_code, p.name_en AS parent_name_en
    FROM accounting_accounts a
    LEFT JOIN accounting_accounts p ON p.id = a.parent_id
    ORDER BY a.code
  `).map(accountRow);
  return enrichAccountsWithBalances(accounts);
}

export function createAccount(input: any): any {
  validateAccountPayload(input);
  const now = new Date().toISOString();
  const id = randomUUID();
  dbRun(
    `INSERT INTO accounting_accounts (id, code, name_ar, name_en, account_type, parent_id, opening_balance, opening_date, currency, status, notes, system_key, normal_balance, posting_account, is_cash_account, is_bank_account, is_vat_account, is_receivable_account, is_payable_account, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.code,
      input.nameAr,
      input.nameEn,
      input.type,
      input.parentId || null,
      roundMoney(input.openingBalance || 0),
      input.openingDate || null,
      input.currency || 'SAR',
      input.status || 'active',
      input.notes || null,
      input.systemKey || null,
      input.normalBalance || defaultNormalBalance(input.type),
      input.postingAccount === false ? 0 : 1,
      input.isCashAccount ? 1 : 0,
      input.isBankAccount ? 1 : 0,
      input.isVatAccount ? 1 : 0,
      input.isReceivableAccount ? 1 : 0,
      input.isPayableAccount ? 1 : 0,
      now,
      now
    ]
  );
  return accountById(id);
}

export function updateAccount(id: string, input: any): any {
  const current = accountById(id);
  if (!current) return undefined;
  validateAccountPayload({ ...current, ...input, id }, id);
  if (input.openingBalance !== undefined && hasAccountTransactions(id)) throw new Error('Opening balance is locked because transactions already exist.');
  if (input.code !== undefined && input.code !== current.code && hasAccountTransactions(id)) throw new Error('Account code cannot be changed because transactions already exist.');
  const now = new Date().toISOString();
  dbRun(
    `UPDATE accounting_accounts
     SET code = ?, name_ar = ?, name_en = ?, account_type = ?, parent_id = ?, opening_balance = ?, opening_date = ?, currency = ?, status = ?, notes = ?,
         normal_balance = ?, posting_account = ?, is_cash_account = ?, is_bank_account = ?, is_vat_account = ?, is_receivable_account = ?, is_payable_account = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.code ?? current.code,
      input.nameAr ?? current.nameAr,
      input.nameEn ?? current.nameEn,
      input.type ?? current.type,
      input.parentId ?? current.parentId ?? null,
      roundMoney(input.openingBalance ?? current.openingBalance),
      input.openingDate ?? current.openingDate ?? null,
      input.currency ?? current.currency,
      input.status ?? current.status,
      input.notes ?? current.notes ?? null,
      input.normalBalance ?? current.normalBalance ?? defaultNormalBalance(input.type ?? current.type),
      (input.postingAccount ?? current.postingAccount) ? 1 : 0,
      (input.isCashAccount ?? current.isCashAccount) ? 1 : 0,
      (input.isBankAccount ?? current.isBankAccount) ? 1 : 0,
      (input.isVatAccount ?? current.isVatAccount) ? 1 : 0,
      (input.isReceivableAccount ?? current.isReceivableAccount) ? 1 : 0,
      (input.isPayableAccount ?? current.isPayableAccount) ? 1 : 0,
      now,
      id
    ]
  );
  return accountById(id);
}

export function deactivateAccount(id: string): any {
  return updateAccount(id, { status: 'inactive' });
}

export function archiveAccount(id: string): any {
  return updateAccount(id, { status: 'archived', postingAccount: false });
}

export function moveAccount(id: string, parentId: string | null): any {
  return updateAccount(id, { parentId: parentId || undefined });
}

export function deleteAccount(id: string): any {
  const current = accountById(id);
  if (!current) return undefined;
  const blockers = accountDeleteBlockers(id, current);
  if (blockers.length) throw new Error('This account cannot be deleted because accounting transactions already exist.');
  dbRun('DELETE FROM accounting_accounts WHERE id = ?', [id]);
  return current;
}

export function suggestAccountCode(parentId = '', type = 'asset'): any {
  const parent = parentId ? accountById(parentId) : undefined;
  const prefix = parent?.code || rootPrefixForType(type);
  return { code: nextAccountCode(prefix), parentId: parentId || '', type };
}

export function listCostCenters(): any[] {
  return dbAll<any>('SELECT id, code, name_ar AS nameAr, name_en AS nameEn, status FROM accounting_cost_centers ORDER BY code');
}

export function listSuppliers(): any[] {
  return dbAll<any>(`
    SELECT s.*, a.code AS payable_code, a.name_en AS payable_name_en
    FROM accounting_suppliers s
    LEFT JOIN accounting_accounts a ON a.id = s.payable_account_id
    ORDER BY s.created_at DESC
  `).map(supplierRow);
}

export function createSupplier(input: any): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  const code = input.supplierCode || nextSupplierCode();
  dbRun(
    `INSERT INTO accounting_suppliers (id, supplier_code, name_ar, name_en, vat_number, commercial_registration, phone, email, address, city, contact_person, payment_terms, opening_balance, payable_account_id, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      code,
      input.nameAr || input.name || null,
      input.nameEn || input.name || code,
      input.vatNumber || null,
      input.commercialRegistration || null,
      input.phone || null,
      input.email || null,
      input.address || null,
      input.city || null,
      input.contactPerson || null,
      input.paymentTerms || null,
      roundMoney(input.openingBalance || 0),
      input.payableAccountId || accountIdBySystemKey('suppliers'),
      input.status || 'active',
      input.notes || null,
      now,
      now
    ]
  );
  return supplierById(id);
}

export function updateSupplier(id: string, input: any): any {
  const current = supplierById(id);
  if (!current) return undefined;
  const now = new Date().toISOString();
  dbRun(
    `UPDATE accounting_suppliers
     SET name_ar = ?, name_en = ?, vat_number = ?, commercial_registration = ?, phone = ?, email = ?, address = ?, city = ?, contact_person = ?, payment_terms = ?, opening_balance = ?, payable_account_id = ?, status = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.nameAr ?? current.nameAr,
      input.nameEn ?? current.nameEn,
      input.vatNumber ?? current.vatNumber ?? null,
      input.commercialRegistration ?? current.commercialRegistration ?? null,
      input.phone ?? current.phone ?? null,
      input.email ?? current.email ?? null,
      input.address ?? current.address ?? null,
      input.city ?? current.city ?? null,
      input.contactPerson ?? current.contactPerson ?? null,
      input.paymentTerms ?? current.paymentTerms ?? null,
      roundMoney(input.openingBalance ?? current.openingBalance),
      input.payableAccountId ?? current.payableAccountId ?? accountIdBySystemKey('suppliers'),
      input.status ?? current.status,
      input.notes ?? current.notes ?? null,
      now,
      id
    ]
  );
  return supplierById(id);
}

export function deactivateSupplier(id: string): any {
  return updateSupplier(id, { status: 'inactive' });
}

export function listExpenseAccounts(): any[] {
  return listAccounts().filter((account) => account.type === 'expense' && account.parentId);
}

export function listPaymentAccounts(): any[] {
  return listAccounts().filter((account) => account.status === 'active' && (account.isCashAccount || account.isBankAccount));
}

export function listRevenueAccounts(): any[] {
  return listAccounts().filter((account) => account.status === 'active' && account.type === 'revenue' && account.parentId);
}

export function listReceivableAccounts(): any[] {
  return listAccounts().filter((account) => account.status === 'active' && account.isReceivableAccount);
}

export function listPayableAccounts(): any[] {
  return listAccounts().filter((account) => account.status === 'active' && account.isPayableAccount);
}

export function syncCustomersFromStudents(): any[] {
  const db = readDb();
  db.students.forEach((student: any) => ensureCustomerForStudent(student));
  return listCustomers();
}

export function ensureCustomerForStudent(student: any): any {
  const existing = dbFirst<any>(
    'SELECT * FROM accounting_customers WHERE student_id = ? OR (registration_id IS NOT NULL AND registration_id = ?) OR (registration_number IS NOT NULL AND registration_number = ?)',
    [student.id, student.registrationId || '', student.registrationNumber || '']
  );
  if (existing) {
    const customer = customerRow(existing);
    reassignLegacyReceivableLines(customer);
    return customer;
  }

  const account = createAccount({
    code: nextAccountCode('1140'),
    nameAr: student.arabicName || student.englishName,
    nameEn: `AR - ${student.englishName}`,
    type: 'asset',
    parentId: accountIdBySystemKey('student-receivables'),
    openingBalance: 0,
    isReceivableAccount: true
  });
  const now = new Date().toISOString();
  const id = randomUUID();
  dbRun(
    `INSERT INTO accounting_customers (id, customer_code, student_id, registration_id, registration_number, parent_link, name_ar, name_en, phone, email, national_id, opening_balance, credit_limit, receivable_account_id, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'active', NULL, ?, ?)`,
    [
      id,
      nextCustomerCode(),
      student.id,
      student.registrationId || null,
      student.registrationNumber || null,
      student.parentName || null,
      student.arabicName || null,
      student.englishName || 'Student',
      student.parentPhone || null,
      student.parentEmail || null,
      student.nationalId || null,
      account.id,
      now,
      now
    ]
  );
  const customer = customerById(id);
  reassignLegacyReceivableLines(customer);
  return customer;
}

export function listCustomers(): any[] {
  return dbAll<any>(`
    SELECT c.*, a.code AS receivable_code, a.name_en AS receivable_name_en, s.grade
    FROM accounting_customers c
    LEFT JOIN accounting_accounts a ON a.id = c.receivable_account_id
    LEFT JOIN students s ON s.id = c.student_id
    ORDER BY c.created_at DESC
  `).map((row) => enrichCustomer(customerRow(row)));
}

export function customerById(id: string): any {
  const row = dbFirst<any>(`
    SELECT c.*, a.code AS receivable_code, a.name_en AS receivable_name_en, s.grade
    FROM accounting_customers c
    LEFT JOIN accounting_accounts a ON a.id = c.receivable_account_id
    LEFT JOIN students s ON s.id = c.student_id
    WHERE c.id = ?
  `, [id]);
  return row ? enrichCustomer(customerRow(row)) : undefined;
}

export function customerStatement(id: string, fromDate = '', toDate = ''): any {
  const customer = customerById(id);
  if (!customer) return undefined;
  const accountLedger = customer.receivableAccountId ? ledger(customer.receivableAccountId, fromDate, toDate) : undefined;
  return {
    customer,
    openingBalance: accountLedger?.openingBalance || 0,
    transactions: accountLedger?.transactions || [],
    closingBalance: accountLedger?.closingBalance || 0
  };
}

export function createInstallmentPlan(customerId: string, input: any): any {
  const customer = customerById(customerId);
  if (!customer) return undefined;
  const totalAmount = roundMoney(input.totalAmount || customer.outstanding || 0);
  const count = Math.max(1, Number(input.installmentsCount || defaultInstallmentCount(input.planType)));
  const startDate = String(input.startDate || new Date().toISOString().slice(0, 10));
  const now = new Date().toISOString();
  const planId = randomUUID();
  dbRun(
    `INSERT INTO ar_installment_plans (id, customer_id, plan_type, name, total_amount, start_date, installments_count, late_fee_type, late_fee_value, grace_period_days, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [
      planId,
      customerId,
      input.planType || 'Custom',
      input.name || `${input.planType || 'Custom'} payment plan`,
      totalAmount,
      startDate,
      count,
      input.lateFeeType || null,
      roundMoney(input.lateFeeValue || 0),
      Number(input.gracePeriodDays || 0),
      input.notes || null,
      now,
      now
    ]
  );
  installmentSchedule(startDate, totalAmount, count, input.installments || []).forEach((item) => dbRun(
    `INSERT INTO ar_installments (id, plan_id, customer_id, due_date, amount, paid_amount, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 'unpaid', ?, ?)`,
    [randomUUID(), planId, customerId, item.dueDate, item.amount, now, now]
  ));
  return customerInstallments(customerId);
}

export function customerInstallments(customerId: string): any {
  const plans = dbAll<any>('SELECT * FROM ar_installment_plans WHERE customer_id = ? ORDER BY created_at DESC', [customerId]);
  const installments = dbAll<any>('SELECT * FROM ar_installments WHERE customer_id = ? ORDER BY due_date', [customerId]).map(installmentRow);
  return {
    plans: plans.map((plan) => ({
      id: plan.id,
      customerId: plan.customer_id,
      planType: plan.plan_type,
      name: plan.name,
      totalAmount: Number(plan.total_amount || 0),
      startDate: plan.start_date,
      installmentsCount: Number(plan.installments_count || 0),
      lateFeeType: plan.late_fee_type || '',
      lateFeeValue: Number(plan.late_fee_value || 0),
      gracePeriodDays: Number(plan.grace_period_days || 0),
      status: plan.status,
      notes: plan.notes || '',
      createdAt: plan.created_at
    })),
    installments
  };
}

export function listCashboxes(): any[] {
  return dbAll<any>(`
    SELECT c.*, a.code, a.name_ar, a.name_en
    FROM accounting_cashboxes c
    JOIN accounting_accounts a ON a.id = c.account_id
    ORDER BY c.created_at DESC
  `).map((row) => cashboxRow(row));
}

export function createCashbox(input: any): any {
  const account = input.accountId
    ? updateAccount(input.accountId, { isCashAccount: true, openingBalance: input.openingBalance ?? 0 })
    : createAccount({
        code: input.code || nextAccountCode('111'),
        nameAr: input.nameAr || input.name,
        nameEn: input.name,
        type: 'asset',
        parentId: accountIdBySystemKey('cash'),
        openingBalance: input.openingBalance || 0,
        isCashAccount: true
      });
  const now = new Date().toISOString();
  const id = randomUUID();
  dbRun(
    `INSERT INTO accounting_cashboxes (id, account_id, name, opening_balance, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, account.id, input.name, roundMoney(input.openingBalance || 0), input.status || 'active', input.notes || null, now, now]
  );
  return cashboxById(id);
}

export function updateCashbox(id: string, input: any): any {
  const current = cashboxById(id);
  if (!current) return undefined;
  const now = new Date().toISOString();
  dbRun(
    'UPDATE accounting_cashboxes SET name = ?, opening_balance = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
    [input.name ?? current.name, roundMoney(input.openingBalance ?? current.openingBalance), input.status ?? current.status, input.notes ?? current.notes ?? null, now, id]
  );
  updateAccount(current.accountId, { isCashAccount: true, openingBalance: input.openingBalance ?? current.openingBalance, status: input.status ?? current.status });
  return cashboxById(id);
}

export function listBanks(): any[] {
  return dbAll<any>(`
    SELECT b.*, a.code, a.name_ar, a.name_en
    FROM accounting_banks b
    JOIN accounting_accounts a ON a.id = b.account_id
    ORDER BY b.created_at DESC
  `).map((row) => bankRow(row));
}

export function createBank(input: any): any {
  const account = input.accountId
    ? updateAccount(input.accountId, { isBankAccount: true, openingBalance: input.openingBalance ?? 0 })
    : createAccount({
        code: input.code || nextAccountCode('112'),
        nameAr: input.nameAr || input.bankName,
        nameEn: input.bankName,
        type: 'asset',
        parentId: accountIdBySystemKey('bank'),
        openingBalance: input.openingBalance || 0,
        isBankAccount: true
      });
  const now = new Date().toISOString();
  const id = randomUUID();
  dbRun(
    `INSERT INTO accounting_banks (id, account_id, bank_name, iban, account_number, opening_balance, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, account.id, input.bankName, input.iban || null, input.accountNumber || null, roundMoney(input.openingBalance || 0), input.status || 'active', input.notes || null, now, now]
  );
  return bankById(id);
}

export function updateBank(id: string, input: any): any {
  const current = bankById(id);
  if (!current) return undefined;
  const now = new Date().toISOString();
  dbRun(
    'UPDATE accounting_banks SET bank_name = ?, iban = ?, account_number = ?, opening_balance = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
    [input.bankName ?? current.bankName, input.iban ?? current.iban ?? null, input.accountNumber ?? current.accountNumber ?? null, roundMoney(input.openingBalance ?? current.openingBalance), input.status ?? current.status, input.notes ?? current.notes ?? null, now, id]
  );
  updateAccount(current.accountId, { isBankAccount: true, openingBalance: input.openingBalance ?? current.openingBalance, status: input.status ?? current.status });
  return bankById(id);
}

export function createCashBankTransfer(input: any, actor: AccountingActor = {}): any {
  const amount = roundMoney(input.amount);
  return createSystemJournal({
    referenceNumber: input.referenceNumber || `TRF-${Date.now()}`,
    postingDate: input.date,
    description: input.description || 'Cash / bank transfer',
    sourceType: 'cash_bank_transfer',
    sourceId: randomUUID(),
    lines: [
      { accountId: input.toAccountId, debit: amount, description: 'Transfer in' },
      { accountId: input.fromAccountId, credit: amount, description: 'Transfer out' }
    ]
  }, actor);
}

export function listAccountingExpenses(): any[] {
  return dbAll<any>(`
    SELECT e.*, s.supplier_code, s.name_ar AS supplier_name_ar, s.name_en AS supplier_name_en, s.vat_number AS supplier_vat_number,
           ea.code AS expense_account_code, ea.name_en AS expense_account_name_en, ea.name_ar AS expense_account_name_ar,
           pa.code AS payment_account_code, pa.name_en AS payment_account_name_en,
           je.entry_number AS journal_entry_number,
           cc.code AS cost_center_code, cc.name_en AS cost_center_name_en
    FROM accounting_expenses e
    LEFT JOIN accounting_suppliers s ON s.id = e.supplier_id
    JOIN accounting_accounts ea ON ea.id = e.expense_account_id
    LEFT JOIN accounting_accounts pa ON pa.id = e.payment_from_account_id
    LEFT JOIN accounting_journal_entries je ON je.id = e.journal_entry_id
    LEFT JOIN accounting_cost_centers cc ON cc.id = e.cost_center_id
    ORDER BY e.expense_date DESC, e.created_at DESC
  `).map(expenseRow);
}

export function createAccountingExpense(input: any, actor: AccountingActor = {}): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  const expenseNo = nextExpenseNo();
  const amountBeforeVat = roundMoney(input.amountBeforeVat);
  const vatAmount = shouldUseInputVat(input.invoiceType) ? roundMoney(input.vatAmount || 0) : 0;
  const totalAmount = roundMoney(amountBeforeVat + vatAmount);
  const paidAmount = paymentStatus(input.paymentStatus) === 'Paid'
    ? totalAmount
    : paymentStatus(input.paymentStatus) === 'Partially Paid'
      ? Math.min(roundMoney(input.paidAmount || 0), totalAmount)
      : 0;
  const payableAmount = roundMoney(totalAmount - paidAmount);
  const supplier = input.supplierId ? supplierById(input.supplierId) : undefined;
  const payableAccountId = supplier?.payableAccountId || accountIdBySystemKey('suppliers');
  const lines: JournalLineInput[] = [
    { accountId: input.expenseAccountId, costCenterId: input.costCenterId, debit: amountBeforeVat, description: input.description }
  ];
  if (vatAmount > 0) lines.push({ accountId: accountIdBySystemKey('input-vat'), debit: vatAmount, description: 'Input VAT' });
  if (paidAmount > 0) lines.push({ accountId: input.paymentFromAccountId || cashAccountForMethod(input.paymentMethod), credit: paidAmount, description: input.paymentMethod || 'Paid' });
  if (payableAmount > 0) lines.push({ accountId: payableAccountId, credit: payableAmount, description: supplier?.nameEn || 'Supplier payable' });

  const journal = createSystemJournal({
    referenceNumber: expenseNo,
    postingDate: input.expenseDate,
    description: `Expense ${expenseNo} - ${input.description}`,
    sourceType: 'accounting_expense',
    sourceId: id,
    lines
  }, actor);

  dbRun(
    `INSERT INTO accounting_expenses (id, expense_no, supplier_id, expense_account_id, invoice_type, supplier_invoice_number, description, cost_center_id, amount_before_vat, vat_rate, vat_amount, total_amount, payment_status, payment_method, payment_from_account_id, journal_entry_id, attachment_upload_id, attachment_file_name, attachment_url, notes, status, expense_date, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)`,
    [
      id,
      expenseNo,
      input.supplierId || null,
      input.expenseAccountId,
      input.invoiceType,
      input.supplierInvoiceNumber || null,
      input.description,
      input.costCenterId || null,
      amountBeforeVat,
      Number(input.vatRate || 0),
      vatAmount,
      totalAmount,
      paymentStatus(input.paymentStatus),
      input.paymentMethod || null,
      input.paymentFromAccountId || null,
      journal.id,
      input.attachmentUploadId || null,
      input.attachmentFileName || null,
      input.attachmentUrl || null,
      input.notes || null,
      input.expenseDate,
      actor.id || null,
      now,
      now
    ]
  );
  return expenseById(id);
}

export function listJournalEntries(): any[] {
  const entries = dbAll<any>('SELECT * FROM accounting_journal_entries ORDER BY posting_date DESC, created_at DESC').map(entryRow);
  const lines = dbAll<any>(`
    SELECT l.*, a.code, a.name_ar, a.name_en
    FROM accounting_journal_lines l
    JOIN accounting_accounts a ON a.id = l.account_id
    ORDER BY l.created_at, l.id
  `);
  return entries.map((entry) => ({
    ...entry,
    lines: lines.filter((line) => line.journal_entry_id === entry.id).map(lineRow)
  }));
}

export function createJournalEntry(input: JournalEntryInput, actor: AccountingActor = {}): any {
  validateBalanced(input.lines);
  const now = new Date().toISOString();
  const status = input.status || 'posted';
  return dbTransaction(() => {
    const id = randomUUID();
    const entryNumber = nextEntryNumber(status === 'draft' ? 'JV-D' : 'JV');
    dbRun(
      `INSERT INTO accounting_journal_entries (id, entry_number, status, reference_number, posting_date, description, source_type, source_id, created_by, created_at, updated_at, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entryNumber,
        status,
        input.referenceNumber || null,
        input.postingDate.slice(0, 10),
        input.description,
        input.sourceType || null,
        input.sourceId || null,
        actor.id || null,
        now,
        now,
        status === 'posted' ? now : null
      ]
    );
    input.lines.forEach((line) => insertLine(id, line, now));
    return journalEntryById(id);
  });
}

export function updateJournalEntry(id: string, input: JournalEntryInput, actor: AccountingActor = {}): any {
  validateBalanced(input.lines);
  const existing = dbFirst<any>('SELECT * FROM accounting_journal_entries WHERE id = ?', [id]);
  if (!existing) return undefined;
  if (existing.source_type || existing.source_id) {
    throw new Error('Only manual journal entries can be edited. Open the source document to correct system-generated entries.');
  }
  const now = new Date().toISOString();
  const status = input.status || existing.status || 'posted';
  return dbTransaction(() => {
    dbRun(
      `UPDATE accounting_journal_entries
       SET status = ?, reference_number = ?, posting_date = ?, description = ?, updated_at = ?, posted_at = ?
       WHERE id = ?`,
      [
        status,
        input.referenceNumber || null,
        input.postingDate.slice(0, 10),
        input.description,
        now,
        status === 'posted' ? (existing.posted_at || now) : null,
        id
      ]
    );
    dbRun('DELETE FROM accounting_journal_lines WHERE journal_entry_id = ?', [id]);
    input.lines.forEach((line) => insertLine(id, line, now));
    return journalEntryById(id);
  });
}

export function deleteJournalEntry(id: string): any {
  const existing = journalEntryById(id);
  if (!existing) return undefined;
  if (existing.sourceType || existing.sourceId) {
    throw new Error('Only manual journal entries can be deleted. Open the source document to reverse system-generated entries.');
  }
  dbRun('DELETE FROM accounting_journal_entries WHERE id = ?', [id]);
  return existing;
}

export function createSystemJournal(input: JournalEntryInput, actor: AccountingActor = {}): any {
  if (input.sourceType && input.sourceId) {
    const existing = dbFirst<any>('SELECT id FROM accounting_journal_entries WHERE source_type = ? AND source_id = ?', [input.sourceType, input.sourceId]);
    if (existing) return journalEntryById(existing.id);
  }
  return createJournalEntry({ ...input, status: 'posted' }, actor);
}

export function ledger(accountId: string, fromDate = '', toDate = ''): any {
  const account = dbFirst<any>('SELECT * FROM accounting_accounts WHERE id = ?', [accountId]);
  if (!account) return undefined;
  const params: any[] = [accountId];
  let dateSql = '';
  if (fromDate) {
    dateSql += ' AND e.posting_date >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    dateSql += ' AND e.posting_date <= ?';
    params.push(toDate);
  }
  const opening = Number(account.opening_balance || 0);
  const rows = dbAll<any>(`
    SELECT e.posting_date, e.entry_number, e.reference_number, e.description AS entry_description,
           e.id AS journal_entry_id, e.source_type, e.source_id, l.description, l.debit, l.credit
    FROM accounting_journal_lines l
    JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
    WHERE l.account_id = ? AND e.status = 'posted'${dateSql}
    ORDER BY e.posting_date, e.created_at, l.id
  `, params);
  let balance = opening;
  const transactions = rows.map((row) => {
    balance = roundMoney(balance + Number(row.debit || 0) - Number(row.credit || 0));
    return {
      date: row.posting_date,
      entryNumber: row.entry_number,
      journalEntryId: row.journal_entry_id,
      referenceNumber: row.reference_number,
      description: row.description || row.entry_description,
      sourceType: row.source_type,
      sourceId: row.source_id,
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      balance
    };
  });
  return { account: accountRow(account), openingBalance: opening, transactions, closingBalance: balance };
}

export function trialBalance(options: TrialBalanceOptions = {}): any {
  const fromDate = options.fromDate || '';
  const toDate = options.toDate || '';
  const displayMode = options.displayMode || (options.showZeroBalances ? 'all' : 'activity');
  const accountType = String(options.accountType || '').trim().toLowerCase();
  const parentAccountId = String(options.parentAccountId || '').trim();
  const costCenterId = String(options.costCenterId || '').trim();
  const currency = String(options.currency || '').trim().toUpperCase();
  const accountStatus = String(options.accountStatus || '').trim().toLowerCase();
  const search = String(options.search || '').trim().toLowerCase();
  const showZeroBalances = displayMode === 'all' || Boolean(options.showZeroBalances);
  const showParentAccounts = Boolean(options.showParentAccounts);
  const params: any[] = [];
  let dateSql = '';
  if (fromDate) {
    dateSql += ' AND e.posting_date >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    dateSql += ' AND e.posting_date <= ?';
    params.push(toDate);
  }
  if (costCenterId) {
    dateSql += ' AND l.cost_center_id = ?';
    params.push(costCenterId);
  }
  const baseAccounts = listAccounts();
  const baseAccountMap = new Map(baseAccounts.map((account) => [account.id, account]));
  const baseChildIds = new Set(baseAccounts.filter((account) => account.parentId).map((account) => account.parentId));
  const isDescendantOf = (account: any, parentId: string): boolean => {
    let currentParent = account.parentId;
    while (currentParent) {
      if (currentParent === parentId) return true;
      currentParent = baseAccountMap.get(currentParent)?.parentId;
    }
    return false;
  };
  const allAccounts = baseAccounts.filter((account) => {
    const matchesType = !accountType || account.type === accountType;
    const matchesParent = !parentAccountId || account.id === parentAccountId || isDescendantOf(account, parentAccountId);
    const matchesCurrency = !currency || String(account.currency || '').toUpperCase() === currency;
    const matchesStatus = !accountStatus || account.status === accountStatus;
    const matchesSearch = !search || [account.code, account.nameAr, account.nameEn].join(' ').toLowerCase().includes(search);
    return matchesType && matchesParent && matchesCurrency && matchesStatus && matchesSearch;
  });
  const childIds = new Set(allAccounts.filter((account) => account.parentId).map((account) => account.parentId));
  const accountMap = new Map(allAccounts.map((account) => [account.id, account]));
  const movements = dbAll<any>(`
    SELECT l.account_id, SUM(l.debit) AS debit, SUM(l.credit) AS credit
    FROM accounting_journal_lines l
    JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
    WHERE e.status = 'posted'${dateSql}
    GROUP BY l.account_id
  `, params);
  const movementMap = new Map(movements.map((row) => [row.account_id, row]));
  const directRows = allAccounts.map((account) => {
    const movement = movementMap.get(account.id) || {};
    const periodDebit = Number(movement.debit || 0);
    const periodCredit = Number(movement.credit || 0);
    const opening = Number(account.openingBalance || 0);
    const closing = roundMoney(opening + periodDebit - periodCredit);
    const hasChildren = childIds.has(account.id);
    return {
      accountId: account.id,
      parentId: account.parentId || '',
      code: account.code,
      nameAr: account.nameAr,
      nameEn: account.nameEn,
      type: account.type,
      level: account.code.length > 1 ? Math.max(0, Math.floor((account.code.length - 1) / 2)) : 0,
      isParent: hasChildren,
      isPosting: !baseChildIds.has(account.id) && account.postingAccount !== false,
      openingBalance: opening,
      closingBalance: closing,
      openingDebit: opening > 0 ? opening : 0,
      openingCredit: opening < 0 ? Math.abs(opening) : 0,
      periodDebit,
      periodCredit,
      closingDebit: closing > 0 ? closing : 0,
      closingCredit: closing < 0 ? Math.abs(closing) : 0
    };
  });
  const directRowMap = new Map(directRows.map((row) => [row.accountId, row]));
  const descendantsByParent = new Map<string, string[]>();
  allAccounts.forEach((account) => {
    if (!account.parentId) return;
    descendantsByParent.set(account.parentId, [...(descendantsByParent.get(account.parentId) || []), account.id]);
  });
  const aggregateCache = new Map<string, any>();
  const aggregateRow = (accountId: string): any => {
    if (aggregateCache.has(accountId)) return aggregateCache.get(accountId);
    const direct = directRowMap.get(accountId);
    if (!direct) return undefined;
    const children = descendantsByParent.get(accountId) || [];
    const childTotals = children.map(aggregateRow).filter(Boolean).reduce((sum, row) => ({
      openingBalance: roundMoney(sum.openingBalance + row.openingBalance),
      periodDebit: roundMoney(sum.periodDebit + row.periodDebit),
      periodCredit: roundMoney(sum.periodCredit + row.periodCredit),
      closingBalance: roundMoney(sum.closingBalance + row.closingBalance)
    }), { openingBalance: 0, periodDebit: 0, periodCredit: 0, closingBalance: 0 });
    const openingBalance = roundMoney(direct.openingBalance + childTotals.openingBalance);
    const closingBalance = roundMoney(direct.closingBalance + childTotals.closingBalance);
    const aggregate = {
      ...direct,
      openingBalance,
      periodDebit: roundMoney(direct.periodDebit + childTotals.periodDebit),
      periodCredit: roundMoney(direct.periodCredit + childTotals.periodCredit),
      closingBalance,
      openingDebit: openingBalance > 0 ? openingBalance : 0,
      openingCredit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      closingDebit: closingBalance > 0 ? closingBalance : 0,
      closingCredit: closingBalance < 0 ? Math.abs(closingBalance) : 0
    };
    aggregateCache.set(accountId, aggregate);
    return aggregate;
  };
  const hasActivity = (row: any): boolean => (
    Math.abs(row.openingBalance) > 0.005
    || Math.abs(row.periodDebit) > 0.005
    || Math.abs(row.periodCredit) > 0.005
    || Math.abs(row.closingBalance) > 0.005
  );
  const hasPeriodActivity = (row: any): boolean => Math.abs(row.periodDebit) > 0.005 || Math.abs(row.periodCredit) > 0.005;
  const matchesDisplayMode = (row: any): boolean => {
    if (displayMode === 'all') return true;
    if (displayMode === 'activity') return hasPeriodActivity(row);
    return hasActivity(row);
  };
  const rows = (showParentAccounts ? allAccounts.map((account) => aggregateRow(account.id)) : directRows.filter((row) => row.isPosting))
    .filter(Boolean)
    .filter((row) => showZeroBalances || matchesDisplayMode(row));
  const totalRows = directRows.filter((row) => row.isPosting).filter((row) => showZeroBalances || matchesDisplayMode(row));
  const totals = totalRows.reduce((sum, row) => ({
    openingDebit: roundMoney(sum.openingDebit + row.openingDebit),
    openingCredit: roundMoney(sum.openingCredit + row.openingCredit),
    periodDebit: roundMoney(sum.periodDebit + row.periodDebit),
    periodCredit: roundMoney(sum.periodCredit + row.periodCredit),
    closingDebit: roundMoney(sum.closingDebit + row.closingDebit),
    closingCredit: roundMoney(sum.closingCredit + row.closingCredit)
  }), { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 });
  return {
    rows,
    totals,
    balanced: Math.abs(totals.periodDebit - totals.periodCredit) < 0.01,
    filters: {
      fromDate,
      toDate,
      displayMode,
      accountType,
      parentAccountId,
      branch: options.branch || '',
      costCenterId,
      currency,
      accountStatus,
      search,
      showZeroBalances,
      showParentAccounts
    }
  };
}

export function accountIdBySystemKey(systemKey: string): string {
  const account = dbFirst<{ id: string }>("SELECT id FROM accounting_accounts WHERE system_key = ? AND status <> 'archived'", [systemKey]);
  if (account) return account.id;
  const fallback = fallbackAccountForSystemKey(systemKey);
  if (fallback) return fallback;
  throw new Error(`Missing configurable accounting account for ${systemKey}. Create or assign a suitable account in Chart of Accounts.`);
}

export function revenueAccountForItem(item: string): string {
  const text = String(item || '').toLowerCase();
  if (text.includes('registration')) return accountIdBySystemKey('revenue-registration');
  if (text.includes('book')) return accountIdBySystemKey('revenue-books');
  if (text.includes('uniform')) return accountIdBySystemKey('revenue-uniform');
  if (text.includes('bus') || text.includes('transport')) return accountIdBySystemKey('revenue-transportation');
  if (text.includes('activit')) return accountIdBySystemKey('revenue-activities');
  if (text.includes('graduation')) return accountIdBySystemKey('revenue-graduation');
  if (text.includes('trip')) return accountIdBySystemKey('revenue-trips');
  return accountIdBySystemKey('revenue-tuition');
}

export function expenseAccountForCategory(category: string): string {
  const text = String(category || '').toLowerCase();
  if (text.includes('salary')) return accountIdBySystemKey('expense-salaries');
  if (text.includes('rent')) return accountIdBySystemKey('expense-rent');
  if (text.includes('util')) return accountIdBySystemKey('expense-utilities');
  if (text.includes('internet')) return accountIdBySystemKey('expense-internet');
  if (text.includes('fuel')) return accountIdBySystemKey('expense-fuel');
  if (text.includes('maintenance')) return accountIdBySystemKey('expense-maintenance');
  if (text.includes('marketing')) return accountIdBySystemKey('expense-marketing');
  if (text.includes('clean')) return accountIdBySystemKey('expense-cleaning');
  if (text.includes('station')) return accountIdBySystemKey('expense-stationery');
  if (text.includes('office') || text.includes('supplies') || text.includes('purchase')) return accountIdBySystemKey('expense-office-supplies');
  if (text.includes('bank')) return accountIdBySystemKey('expense-bank-charges');
  if (text.includes('medical')) return accountIdBySystemKey('expense-medical');
  return accountIdBySystemKey('expense-misc');
}

export function cashAccountForMethod(method: string): string {
  const text = String(method || '').toLowerCase();
  if (text.includes('bank') || text.includes('transfer')) return accountIdBySystemKey('bank');
  if (text.includes('card') || text.includes('online')) return accountIdBySystemKey('card');
  return accountIdBySystemKey('main-cashbox');
}

export function receivableAccountForStudentContext(context: any): string {
  syncCustomersFromStudents();
  const row = dbFirst<any>(
    `SELECT receivable_account_id
     FROM accounting_customers
     WHERE (registration_id IS NOT NULL AND registration_id = ?)
        OR (registration_number IS NOT NULL AND registration_number = ?)
        OR LOWER(name_en) = LOWER(?)
     LIMIT 1`,
    [context.registrationId || '', context.registrationNumber || '', context.studentName || '']
  );
  return row?.receivable_account_id || accountIdBySystemKey('student-receivables');
}

export function supplierProfile(id: string): any {
  const supplier = supplierById(id);
  if (!supplier) return undefined;
  const statement = supplierStatement(id);
  const expenses = listAccountingExpenses().filter((expense) => expense.supplierId === id);
  const payments = dbAll<any>(`
    SELECT p.*, a.code AS payment_account_code, a.name_en AS payment_account_name_en, je.entry_number
    FROM ap_supplier_payments p
    JOIN accounting_accounts a ON a.id = p.payment_account_id
    LEFT JOIN accounting_journal_entries je ON je.id = p.journal_entry_id
    WHERE p.supplier_id = ?
    ORDER BY p.paid_at DESC, p.created_at DESC
  `, [id]).map(supplierPaymentRow);
  return {
    supplier,
    summary: {
      openingBalance: supplier.openingBalance,
      currentBalance: statement.closingBalance,
      invoiceTotal: roundMoney(expenses.reduce((sum, expense) => sum + Number(expense.totalAmount || 0), 0)),
      paidTotal: roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
      unpaidInvoices: expenses.filter((expense) => expense.paymentStatus !== 'Paid').length,
      paymentsCount: payments.length,
      lastPayment: payments[0]?.paidAt || ''
    },
    expenses,
    payments,
    statement
  };
}

export function supplierStatement(id: string, fromDate = '', toDate = ''): any {
  const supplier = supplierById(id);
  if (!supplier) return undefined;
  const accountLedger = supplier.payableAccountId ? ledger(supplier.payableAccountId, fromDate, toDate) : undefined;
  return {
    supplier,
    openingBalance: accountLedger?.openingBalance || 0,
    transactions: accountLedger?.transactions || [],
    closingBalance: accountLedger?.closingBalance || 0
  };
}

export function createSupplierPayment(input: any, actor: AccountingActor = {}): any {
  const supplier = supplierById(input.supplierId);
  if (!supplier) throw new Error('Supplier not found.');
  const amount = roundMoney(input.amount);
  const paymentNo = nextSupplierPaymentNo();
  const journal = createSystemJournal({
    referenceNumber: paymentNo,
    postingDate: input.paidAt,
    description: `Supplier payment ${paymentNo} - ${supplier.nameEn}`,
    sourceType: 'ap_supplier_payment',
    sourceId: paymentNo,
    lines: [
      { accountId: supplier.payableAccountId || accountIdBySystemKey('suppliers'), debit: amount, description: supplier.nameEn },
      { accountId: input.paymentAccountId || cashAccountForMethod(input.paymentMethod), credit: amount, description: input.paymentMethod || 'Payment' }
    ]
  }, actor);
  const now = new Date().toISOString();
  const id = randomUUID();
  dbRun(
    `INSERT INTO ap_supplier_payments (id, supplier_id, payment_no, payment_type, amount, payment_account_id, payment_method, paid_at, journal_entry_id, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      supplier.id,
      paymentNo,
      input.paymentType || 'partial',
      amount,
      input.paymentAccountId || cashAccountForMethod(input.paymentMethod),
      input.paymentMethod || 'Cash',
      input.paidAt,
      journal.id,
      input.notes || null,
      actor.id || null,
      now
    ]
  );
  return supplierProfile(supplier.id);
}

export function supplierAging(): any {
  const today = new Date().toISOString().slice(0, 10);
  const rows = listSuppliers().map((supplier) => {
    const expenses = listAccountingExpenses().filter((expense) => expense.supplierId === supplier.id && expense.paymentStatus !== 'Paid');
    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    expenses.forEach((expense) => {
      const age = daysBetween(expense.expenseDate, today);
      const amount = Number(expense.totalAmount || 0);
      if (age <= 0) buckets.current += amount;
      else if (age <= 30) buckets.days30 += amount;
      else if (age <= 60) buckets.days60 += amount;
      else if (age <= 90) buckets.days90 += amount;
      else buckets.over90 += amount;
    });
    const total = roundMoney(Object.values(buckets).reduce((sum, value) => sum + value, 0));
    return { supplier, ...buckets, total };
  });
  return { rows, total: roundMoney(rows.reduce((sum, row) => sum + row.total, 0)) };
}

export function globalAccountingSearch(query: string): any {
  const q = `%${String(query || '').trim().toLowerCase()}%`;
  if (q === '%%') return { accounts: [], customers: [], suppliers: [], invoices: [], payments: [], journals: [] };
  return {
    accounts: listAccounts().filter((item) => [item.code, item.nameAr, item.nameEn, item.notes, item.systemKey].join(' ').toLowerCase().includes(q.slice(1, -1))).slice(0, 20),
    customers: listCustomers().filter((item) => [item.customerCode, item.nameAr, item.nameEn, item.phone, item.email, item.registrationNumber].join(' ').toLowerCase().includes(q.slice(1, -1))).slice(0, 20),
    suppliers: listSuppliers().filter((item) => [item.supplierCode, item.nameAr, item.nameEn, item.vatNumber, item.phone].join(' ').toLowerCase().includes(q.slice(1, -1))).slice(0, 20),
    invoices: dbAll<any>('SELECT * FROM finance_invoices WHERE LOWER(invoice_number || student_name || fee_item) LIKE ? ORDER BY issued_at DESC LIMIT 20', [q]),
    payments: dbAll<any>('SELECT * FROM finance_payments WHERE LOWER(receipt_number || payment_item || method) LIKE ? ORDER BY paid_at DESC LIMIT 20', [q]),
    journals: dbAll<any>('SELECT * FROM accounting_journal_entries WHERE LOWER(entry_number || reference_number || description) LIKE ? ORDER BY posting_date DESC LIMIT 20', [q]).map(entryRow)
  };
}

export function accountingDashboard(fromDate = '', toDate = ''): any {
  const accounts = listAccounts();
  const sumAccounts = (predicate: (account: any) => boolean): number => roundMoney(
    accounts.filter(predicate).reduce((sum, account) => sum + Number(account.currentBalance || 0), 0)
  );
  const cashBalance = sumAccounts((account) => account.isCashAccount);
  const bankBalance = sumAccounts((account) => account.isBankAccount);
  const accountsReceivable = sumAccounts((account) => account.isReceivableAccount);
  const accountsPayable = Math.abs(sumAccounts((account) => account.isPayableAccount));
  const fixedAssets = sumAccounts((account) => account.type === 'asset' && String(account.code).startsWith('12'));
  const currentAssets = sumAccounts((account) => account.type === 'asset' && String(account.code).startsWith('11'));
  const currentLiabilities = Math.abs(sumAccounts((account) => account.type === 'liability' && String(account.code).startsWith('21')));
  const vatReceivable = sumAccounts((account) => account.systemKey === 'input-vat');
  const vatPayable = Math.abs(sumAccounts((account) => account.systemKey === 'vat-payable'));
  const revenue = Math.abs(sumAccounts((account) => account.type === 'revenue'));
  const expenses = sumAccounts((account) => account.type === 'expense');
  const ownerEquity = Math.abs(sumAccounts((account) => account.type === 'equity'));

  const dateParams: any[] = [];
  let dateSql = '';
  if (fromDate) {
    dateSql += ' AND e.posting_date >= ?';
    dateParams.push(fromDate);
  }
  if (toDate) {
    dateSql += ' AND e.posting_date <= ?';
    dateParams.push(toDate);
  }

  const monthlyRows = dbAll<any>(`
    SELECT substr(e.posting_date, 1, 7) AS month,
           SUM(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END) AS revenue,
           SUM(CASE WHEN a.account_type = 'expense' THEN l.debit - l.credit ELSE 0 END) AS expenses,
           SUM(CASE WHEN a.is_cash_account = 1 OR a.is_bank_account = 1 THEN l.debit - l.credit ELSE 0 END) AS cash_flow
    FROM accounting_journal_lines l
    JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
    JOIN accounting_accounts a ON a.id = l.account_id
    WHERE e.status = 'posted'${dateSql}
    GROUP BY substr(e.posting_date, 1, 7)
    ORDER BY month
  `, dateParams);

  const expenseCategories = dbAll<any>(`
    SELECT a.code, a.name_en AS name, SUM(l.debit - l.credit) AS amount
    FROM accounting_journal_lines l
    JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
    JOIN accounting_accounts a ON a.id = l.account_id
    WHERE e.status = 'posted' AND a.account_type = 'expense'${dateSql}
    GROUP BY a.id
    HAVING amount <> 0
    ORDER BY amount DESC
    LIMIT 8
  `, dateParams).map((row) => ({ code: row.code, name: row.name, amount: roundMoney(row.amount) }));

  const assetsDistribution = accounts
    .filter((account) => account.type === 'asset' && Number(account.currentBalance || 0) !== 0)
    .slice(0, 8)
    .map((account) => ({ code: account.code, name: account.nameEn, amount: roundMoney(account.currentBalance) }));

  const recentBankTransactions = dbAll<any>(`
    SELECT e.entry_number, e.posting_date, e.description, a.code, a.name_en, l.debit, l.credit
    FROM accounting_journal_lines l
    JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
    JOIN accounting_accounts a ON a.id = l.account_id
    WHERE e.status = 'posted' AND (a.is_cash_account = 1 OR a.is_bank_account = 1)
    ORDER BY e.posting_date DESC, e.created_at DESC
    LIMIT 8
  `).map((row) => ({
    entryNumber: row.entry_number,
    date: row.posting_date,
    description: row.description,
    account: `${row.code} - ${row.name_en}`,
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0)
  }));

  return {
    kpis: {
      cashBalance,
      bankBalance,
      accountsReceivable,
      accountsPayable,
      fixedAssets,
      currentAssets,
      currentLiabilities,
      vatReceivable,
      vatPayable,
      netProfit: roundMoney(revenue - expenses),
      ownerEquity
    },
    charts: {
      monthlyRevenue: monthlyRows.map((row) => ({ label: row.month, value: roundMoney(row.revenue) })),
      monthlyExpenses: monthlyRows.map((row) => ({ label: row.month, value: roundMoney(row.expenses) })),
      cashFlow: monthlyRows.map((row) => ({ label: row.month, value: roundMoney(row.cash_flow) })),
      revenueVsExpense: monthlyRows.map((row) => ({ label: row.month, revenue: roundMoney(row.revenue), expenses: roundMoney(row.expenses) })),
      monthlyProfit: monthlyRows.map((row) => ({ label: row.month, value: roundMoney(Number(row.revenue || 0) - Number(row.expenses || 0)) })),
      assetsDistribution,
      expenseCategories
    },
    recent: {
      journalEntries: listJournalEntries().slice(0, 8),
      payments: dbAll<any>('SELECT receipt_number, payment_item, amount, method, paid_at, collected_by FROM finance_payments ORDER BY paid_at DESC, created_at DESC LIMIT 8'),
      receipts: dbAll<any>('SELECT payment_no, amount, payment_method, paid_at FROM ar_customer_payments ORDER BY paid_at DESC, created_at DESC LIMIT 8'),
      suppliers: listSuppliers().slice(0, 8),
      bankTransactions: recentBankTransactions
    },
    workflow: {
      pendingApprovals: dbFirst<{ total: number }>("SELECT COUNT(*) AS total FROM accounting_journal_entries WHERE status IN ('submitted', 'approved')")?.total || 0,
      draftJournals: dbFirst<{ total: number }>("SELECT COUNT(*) AS total FROM accounting_journal_entries WHERE status = 'draft'")?.total || 0,
      unpostedJournals: dbFirst<{ total: number }>("SELECT COUNT(*) AS total FROM accounting_journal_entries WHERE status <> 'posted'")?.total || 0
    }
  };
}

function supplierById(id: string): any {
  const row = dbFirst<any>('SELECT * FROM accounting_suppliers WHERE id = ?', [id]);
  return row ? supplierRow(row) : undefined;
}

function enrichAccountsWithBalances(accounts: any[]): any[] {
  const movements = dbAll<any>(`
    SELECT l.account_id,
           SUM(l.debit) AS debit,
           SUM(l.credit) AS credit,
           COUNT(DISTINCT e.id) AS journal_count,
           MAX(e.posting_date) AS last_transaction_date
    FROM accounting_journal_lines l
    JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
    WHERE e.status = 'posted'
    GROUP BY l.account_id
  `);
  const movementMap = new Map(movements.map((row) => [row.account_id, row]));
  return accounts.map((account) => {
    const movement = movementMap.get(account.id) || {};
    const debit = Number(movement.debit || 0);
    const credit = Number(movement.credit || 0);
    const currentBalance = roundMoney(Number(account.openingBalance || 0) + debit - credit);
    return {
      ...account,
      debit,
      credit,
      currentBalance,
      journalEntries: Number(movement.journal_count || 0),
      lastTransactionDate: movement.last_transaction_date || '',
      hasTransactions: Number(movement.journal_count || 0) > 0,
      canDelete: accountCanDelete(account, Number(movement.journal_count || 0))
    };
  });
}

function validateAccountPayload(input: any, currentId = ''): void {
  if (!input.code || !input.nameAr || !input.nameEn || !input.type) throw new Error('Missing required account fields.');
  const duplicate = dbFirst<any>('SELECT id FROM accounting_accounts WHERE code = ? AND id <> ?', [String(input.code).trim(), currentId || '']);
  if (duplicate) throw new Error('Account code already exists.');
  if (input.parentId) {
    if (input.parentId === currentId) throw new Error('Invalid hierarchy: account cannot be its own parent.');
    const parent = accountById(input.parentId);
    if (!parent) throw new Error('Parent account not found.');
    if (currentId && isDescendant(input.parentId, currentId)) throw new Error('Invalid hierarchy: parent cannot be a child of this account.');
  }
}

function isDescendant(accountId: string, possibleAncestorId: string): boolean {
  let current = accountById(accountId);
  const visited = new Set<string>();
  while (current?.parentId) {
    if (current.parentId === possibleAncestorId) return true;
    if (visited.has(current.parentId)) return true;
    visited.add(current.parentId);
    current = accountById(current.parentId);
  }
  return false;
}

function accountDeleteBlockers(id: string, account: any): string[] {
  const blockers: string[] = [];
  if (Number(account.openingBalance || 0) !== 0) blockers.push('opening balance');
  if (hasAccountTransactions(id)) blockers.push('transactions');
  if (dbFirst<any>('SELECT id FROM accounting_accounts WHERE parent_id = ? LIMIT 1', [id])) blockers.push('child accounts');
  return blockers;
}

function accountCanDelete(account: any, journalCount: number): boolean {
  return Number(account.openingBalance || 0) === 0 &&
    journalCount === 0 &&
    !dbFirst<any>('SELECT id FROM accounting_accounts WHERE parent_id = ? LIMIT 1', [account.id]);
}

function hasAccountTransactions(id: string): boolean {
  return Boolean(dbFirst<any>('SELECT id FROM accounting_journal_lines WHERE account_id = ? LIMIT 1', [id]));
}

function defaultNormalBalance(type: string): 'debit' | 'credit' {
  return ['asset', 'expense'].includes(String(type)) ? 'debit' : 'credit';
}

function fallbackAccountForSystemKey(systemKey: string): string | undefined {
  if (systemKey.includes('revenue') || systemKey === 'stock-adjustment-gain') return firstPostingAccount({ type: 'revenue' });
  if (systemKey.includes('expense') || systemKey === 'cost-of-goods-sold' || systemKey === 'stock-adjustment-loss') return firstPostingAccount({ type: 'expense' });
  if (systemKey.includes('cash') || systemKey === 'cash') return firstPostingAccount({ type: 'asset', flag: 'is_cash_account' }) || firstPostingAccount({ type: 'asset' });
  if (systemKey.includes('bank') || systemKey === 'card') return firstPostingAccount({ type: 'asset', flag: 'is_bank_account' }) || firstPostingAccount({ type: 'asset' });
  if (systemKey.includes('receivable') || systemKey === 'student-receivables') return firstPostingAccount({ type: 'asset', flag: 'is_receivable_account' }) || firstPostingAccount({ type: 'asset' });
  if (systemKey.includes('supplier') || systemKey.includes('payable')) return firstPostingAccount({ type: 'liability', flag: 'is_payable_account' }) || firstPostingAccount({ type: 'liability' });
  if (systemKey.includes('vat')) return firstPostingAccount({ flag: 'is_vat_account' });
  if (systemKey === 'inventory') return firstPostingAccount({ type: 'asset' });
  return undefined;
}

function firstPostingAccount(filter: { type?: string; flag?: string }): string | undefined {
  const params: any[] = [];
  let sql = "SELECT id FROM accounting_accounts WHERE status = 'active' AND posting_account = 1";
  if (filter.type) {
    sql += ' AND account_type = ?';
    params.push(filter.type);
  }
  if (filter.flag) sql += ` AND ${filter.flag} = 1`;
  sql += ' ORDER BY code LIMIT 1';
  return dbFirst<{ id: string }>(sql, params)?.id;
}

function rootPrefixForType(type: string): string {
  if (type === 'liability') return '2';
  if (type === 'equity') return '3';
  if (type === 'revenue') return '4';
  if (type === 'expense') return '5';
  return '1';
}

function accountById(id: string): any {
  const row = dbFirst<any>(`
    SELECT a.*, p.code AS parent_code, p.name_en AS parent_name_en
    FROM accounting_accounts a
    LEFT JOIN accounting_accounts p ON p.id = a.parent_id
    WHERE a.id = ?
  `, [id]);
  return row ? accountRow(row) : undefined;
}

function cashboxById(id: string): any {
  const row = dbFirst<any>(`
    SELECT c.*, a.code, a.name_ar, a.name_en
    FROM accounting_cashboxes c
    JOIN accounting_accounts a ON a.id = c.account_id
    WHERE c.id = ?
  `, [id]);
  return row ? cashboxRow(row) : undefined;
}

function bankById(id: string): any {
  const row = dbFirst<any>(`
    SELECT b.*, a.code, a.name_ar, a.name_en
    FROM accounting_banks b
    JOIN accounting_accounts a ON a.id = b.account_id
    WHERE b.id = ?
  `, [id]);
  return row ? bankRow(row) : undefined;
}

function expenseById(id: string): any {
  return listAccountingExpenses().find((expense) => expense.id === id);
}

function supplierRow(row: any): any {
  return {
    id: row.id,
    supplierCode: row.supplier_code,
    nameAr: row.name_ar || '',
    nameEn: row.name_en,
    vatNumber: row.vat_number || '',
    commercialRegistration: row.commercial_registration || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    city: row.city || '',
    contactPerson: row.contact_person || '',
    paymentTerms: row.payment_terms || '',
    openingBalance: Number(row.opening_balance || 0),
    payableAccountId: row.payable_account_id || '',
    payableCode: row.payable_code || '',
    payableNameEn: row.payable_name_en || '',
    status: row.status,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function customerRow(row: any): any {
  return {
    id: row.id,
    customerCode: row.customer_code,
    studentId: row.student_id || '',
    registrationId: row.registration_id || '',
    registrationNumber: row.registration_number || '',
    parentLink: row.parent_link || '',
    nameAr: row.name_ar || '',
    nameEn: row.name_en,
    phone: row.phone || '',
    email: row.email || '',
    nationalId: row.national_id || '',
    openingBalance: Number(row.opening_balance || 0),
    creditLimit: Number(row.credit_limit || 0),
    receivableAccountId: row.receivable_account_id || '',
    receivableCode: row.receivable_code || '',
    receivableNameEn: row.receivable_name_en || '',
    grade: row.grade || '',
    status: row.status,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function enrichCustomer(customer: any): any {
  const db = readDb();
  const invoices = db.financeInvoices.filter((invoice: any) => matchesCustomer(customer, invoice));
  const payments = db.financePayments.filter((payment: any) => matchesCustomer(customer, payment));
  const accountLedger = customer.receivableAccountId ? ledger(customer.receivableAccountId) : undefined;
  const installments = dbAll<any>('SELECT * FROM ar_installments WHERE customer_id = ?', [customer.id]).map(installmentRow);
  const overdueAmount = installments
    .filter((item) => item.status !== 'paid' && item.dueDate < new Date().toISOString().slice(0, 10))
    .reduce((sum, item) => sum + Number(item.amount || 0) - Number(item.paidAmount || 0), 0);
  return {
    ...customer,
    summary: {
      currentBalance: roundMoney(accountLedger?.closingBalance || customer.openingBalance || 0),
      outstanding: Math.max(0, roundMoney(accountLedger?.closingBalance || 0)),
      credit: Math.max(0, roundMoney(-(accountLedger?.closingBalance || 0))),
      overdue: roundMoney(overdueAmount),
      invoicesCount: invoices.length,
      paymentsCount: payments.length,
      invoiceTotal: roundMoney(invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)),
      paymentTotal: roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
      lastPayment: payments.sort((a: any, b: any) => String(b.paidAt).localeCompare(String(a.paidAt)))[0]?.paidAt || ''
    },
    invoices,
    payments,
    installments
  };
}

function matchesCustomer(customer: any, record: any): boolean {
  return Boolean(
    (customer.registrationId && record.registrationId === customer.registrationId) ||
    (customer.registrationNumber && record.registrationNumber === customer.registrationNumber) ||
    (customer.nameEn && record.studentName === customer.nameEn)
  );
}

function reassignLegacyReceivableLines(customer: any): void {
  if (!customer?.receivableAccountId) return;
  const db = readDb();
  const legacyReceivableId = accountIdBySystemKey('student-receivables');
  const invoices = db.financeInvoices.filter((invoice: any) => matchesCustomer(customer, invoice));
  const payments = db.financePayments.filter((payment: any) => matchesCustomer(customer, payment));
  invoices.forEach((invoice: any) => dbRun(
    `UPDATE accounting_journal_lines
     SET account_id = ?
     WHERE account_id = ?
       AND journal_entry_id IN (SELECT id FROM accounting_journal_entries WHERE source_type = 'finance_invoice' AND source_id = ?)`,
    [customer.receivableAccountId, legacyReceivableId, invoice.id]
  ));
  payments.forEach((payment: any) => dbRun(
    `UPDATE accounting_journal_lines
     SET account_id = ?
     WHERE account_id = ?
       AND journal_entry_id IN (SELECT id FROM accounting_journal_entries WHERE source_type = 'finance_payment' AND source_id = ?)`,
    [customer.receivableAccountId, legacyReceivableId, payment.id]
  ));
}

function installmentRow(row: any): any {
  return {
    id: row.id,
    planId: row.plan_id,
    customerId: row.customer_id,
    dueDate: row.due_date,
    amount: Number(row.amount || 0),
    paidAmount: Number(row.paid_amount || 0),
    status: installmentStatus(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function supplierPaymentRow(row: any): any {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    paymentNo: row.payment_no,
    paymentType: row.payment_type,
    amount: Number(row.amount || 0),
    paymentAccountId: row.payment_account_id,
    paymentAccountCode: row.payment_account_code || '',
    paymentAccountName: row.payment_account_name_en || '',
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    journalEntryId: row.journal_entry_id || '',
    journalEntryNo: row.entry_number || '',
    notes: row.notes || '',
    createdAt: row.created_at
  };
}

function installmentStatus(row: any): string {
  const amount = Number(row.amount || 0);
  const paid = Number(row.paid_amount || 0);
  if (paid >= amount) return 'paid';
  if (paid > 0) return 'partial';
  if (String(row.due_date) < new Date().toISOString().slice(0, 10)) return 'overdue';
  return row.status || 'unpaid';
}

function expenseRow(row: any): any {
  return {
    id: row.id,
    no: row.expense_no,
    expenseNo: row.expense_no,
    supplierId: row.supplier_id || '',
    supplierCode: row.supplier_code || '',
    supplierName: row.supplier_name_en || row.supplier_name_ar || '-',
    supplierVatNumber: row.supplier_vat_number || '',
    expenseAccountId: row.expense_account_id,
    category: row.expense_account_name_en,
    categoryAccountCode: row.expense_account_code,
    categoryAccountNameAr: row.expense_account_name_ar,
    invoiceType: row.invoice_type,
    supplierInvoiceNumber: row.supplier_invoice_number || '',
    title: row.description,
    description: row.description,
    costCenterId: row.cost_center_id || '',
    costCenter: row.cost_center_name_en || '',
    amountBeforeVat: Number(row.amount_before_vat || 0),
    vatRate: Number(row.vat_rate || 0),
    vatAmount: Number(row.vat_amount || 0),
    amount: Number(row.total_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    paymentStatus: row.payment_status,
    status: row.payment_status,
    paymentMethod: row.payment_method || '',
    paymentFromAccountId: row.payment_from_account_id || '',
    paymentFrom: row.payment_account_name_en || '',
    journalEntryId: row.journal_entry_id || '',
    journalEntryNo: row.journal_entry_number || '',
    attachmentUploadId: row.attachment_upload_id || '',
    attachmentFileName: row.attachment_file_name || '',
    attachmentUrl: row.attachment_url || '',
    notes: row.notes || '',
    date: row.expense_date,
    expenseDate: row.expense_date,
    recordStatus: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function cashboxRow(row: any): any {
  const accountLedger = ledger(row.account_id);
  return {
    id: row.id,
    accountId: row.account_id,
    accountCode: row.code,
    accountNameAr: row.name_ar,
    accountNameEn: row.name_en,
    name: row.name,
    openingBalance: Number(row.opening_balance || 0),
    currentBalance: Number(accountLedger?.closingBalance || 0),
    status: row.status,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function bankRow(row: any): any {
  const accountLedger = ledger(row.account_id);
  return {
    id: row.id,
    accountId: row.account_id,
    accountCode: row.code,
    accountNameAr: row.name_ar,
    accountNameEn: row.name_en,
    bankName: row.bank_name,
    iban: row.iban || '',
    accountNumber: row.account_number || '',
    openingBalance: Number(row.opening_balance || 0),
    currentBalance: Number(accountLedger?.closingBalance || 0),
    status: row.status,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function nextSupplierCode(): string {
  const row = dbFirst<{ total: number }>('SELECT COUNT(*) AS total FROM accounting_suppliers');
  return `SUP-${String(Number(row?.total || 0) + 1).padStart(5, '0')}`;
}

function nextCustomerCode(): string {
  const row = dbFirst<{ total: number }>('SELECT COUNT(*) AS total FROM accounting_customers');
  return `CUS-${String(Number(row?.total || 0) + 1).padStart(5, '0')}`;
}

function nextExpenseNo(): string {
  const row = dbFirst<{ total: number }>('SELECT COUNT(*) AS total FROM accounting_expenses');
  return `EXP-${String(Number(row?.total || 0) + 1).padStart(6, '0')}`;
}

function nextSupplierPaymentNo(): string {
  const row = dbFirst<{ total: number }>('SELECT COUNT(*) AS total FROM ap_supplier_payments');
  return `SP-${String(Number(row?.total || 0) + 1).padStart(6, '0')}`;
}

function defaultInstallmentCount(planType: string): number {
  if (planType === 'Annual Tuition') return 1;
  if (planType === 'Semester') return 2;
  if (planType === 'Monthly') return 10;
  return 1;
}

function installmentSchedule(startDate: string, totalAmount: number, count: number, custom: any[]): Array<{ dueDate: string; amount: number }> {
  if (Array.isArray(custom) && custom.length) {
    return custom.map((item) => ({ dueDate: String(item.dueDate || startDate), amount: roundMoney(item.amount || 0) }));
  }
  const base = roundMoney(totalAmount / count);
  const rows = Array.from({ length: count }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + index);
    return { dueDate: date.toISOString().slice(0, 10), amount: base };
  });
  const diff = roundMoney(totalAmount - rows.reduce((sum, row) => sum + row.amount, 0));
  rows[rows.length - 1].amount = roundMoney(rows[rows.length - 1].amount + diff);
  return rows;
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(`${String(from).slice(0, 10)}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${String(to).slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.floor((toMs - fromMs) / 86_400_000);
}

function nextAccountCode(prefix: string): string {
  const row = dbFirst<{ max_code: string }>('SELECT MAX(code) AS max_code FROM accounting_accounts WHERE code LIKE ?', [`${prefix}%`]);
  const next = Number(row?.max_code || `${prefix}0`) + 1;
  return String(next);
}

function shouldUseInputVat(invoiceType: string): boolean {
  return ['Tax Invoice', 'Simplified Tax Invoice'].includes(String(invoiceType || ''));
}

function paymentStatus(value: string): 'Paid' | 'Unpaid' | 'Partially Paid' {
  if (value === 'Partially Paid') return 'Partially Paid';
  if (value === 'Unpaid') return 'Unpaid';
  return 'Paid';
}

function insertLine(entryId: string, line: JournalLineInput, now: string): void {
  dbRun(
    `INSERT INTO accounting_journal_lines (id, journal_entry_id, account_id, cost_center_id, description, debit, credit, currency, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SAR', ?)`,
    [randomUUID(), entryId, line.accountId, line.costCenterId || null, line.description || null, roundMoney(line.debit || 0), roundMoney(line.credit || 0), now]
  );
}

function validateBalanced(lines: JournalLineInput[]): void {
  if (lines.length < 2) throw new Error('Journal entry must contain at least two lines.');
  const debit = roundMoney(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const credit = roundMoney(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  if (debit <= 0 || credit <= 0 || Math.abs(debit - credit) > 0.01) {
    throw new Error('Journal entry debit and credit totals must be equal.');
  }
  lines.forEach((line) => {
    if (Number(line.debit || 0) > 0 && Number(line.credit || 0) > 0) throw new Error('A line cannot contain both debit and credit.');
    const account = accountById(line.accountId);
    if (!account) throw new Error('Journal line account not found.');
    if (account.status === 'archived' || account.postingAccount === false) throw new Error(`Account ${account.code} cannot receive transactions.`);
  });
}

function nextEntryNumber(prefix: string): string {
  const count = dbFirst<{ total: number }>('SELECT COUNT(*) AS total FROM accounting_journal_entries')?.total || 0;
  return `${prefix}-${String(Number(count) + 1).padStart(6, '0')}`;
}

function journalEntryById(id: string): any {
  const entry = dbFirst<any>('SELECT * FROM accounting_journal_entries WHERE id = ?', [id]);
  if (!entry) return undefined;
  const lines = dbAll<any>(`
    SELECT l.*, a.code, a.name_ar, a.name_en
    FROM accounting_journal_lines l
    JOIN accounting_accounts a ON a.id = l.account_id
    WHERE l.journal_entry_id = ?
    ORDER BY l.created_at, l.id
  `, [id]).map(lineRow);
  return { ...entryRow(entry), lines };
}

function accountRow(row: any): any {
  return {
    id: row.id,
    code: row.code,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    type: row.account_type,
    parentId: row.parent_id || undefined,
    parentCode: row.parent_code || undefined,
    parentNameEn: row.parent_name_en || undefined,
    openingBalance: Number(row.opening_balance || 0),
    openingDate: row.opening_date || undefined,
    currency: row.currency,
    costCenterId: row.cost_center_id || undefined,
    status: row.status,
    notes: row.notes || undefined,
    systemKey: row.system_key || undefined,
    normalBalance: row.normal_balance || defaultNormalBalance(row.account_type),
    postingAccount: row.posting_account === undefined ? true : Boolean(row.posting_account),
    isCashAccount: Boolean(row.is_cash_account),
    isBankAccount: Boolean(row.is_bank_account),
    isVatAccount: Boolean(row.is_vat_account),
    isReceivableAccount: Boolean(row.is_receivable_account),
    isPayableAccount: Boolean(row.is_payable_account)
  };
}

function entryRow(row: any): any {
  return {
    id: row.id,
    entryNumber: row.entry_number,
    status: row.status,
    referenceNumber: row.reference_number || undefined,
    postingDate: row.posting_date,
    description: row.description,
    sourceType: row.source_type || undefined,
    sourceId: row.source_id || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    postedAt: row.posted_at || undefined,
    reversedFromId: row.reversed_from_id || undefined
  };
}

function lineRow(row: any): any {
  return {
    id: row.id,
    accountId: row.account_id,
    accountCode: row.code,
    accountNameAr: row.name_ar,
    accountNameEn: row.name_en,
    costCenterId: row.cost_center_id || undefined,
    description: row.description || undefined,
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    currency: row.currency
  };
}

function roundMoney(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}
