import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import helmet from 'helmet';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AuthRequest, createOpaqueToken, hashToken, requireAuth, requireRole, signRefreshToken, signUser, verifyRefreshToken } from './auth.js';
import { accountIdBySystemKey, accountingDashboard, archiveAccount, cashAccountForMethod, createAccount, createAccountingExpense, createBank, createCashBankTransfer, createCashbox, createInstallmentPlan, createJournalEntry, createSupplier, createSupplierPayment, createSystemJournal, customerById, customerInstallments, customerStatement, deactivateAccount, deactivateSupplier, deleteAccount, ensureCustomerForStudent, expenseAccountForCategory, globalAccountingSearch, ledger, listAccountingExpenses, listAccounts, listBanks, listCashboxes, listCostCenters, listCustomers, listExpenseAccounts, listJournalEntries, listPayableAccounts, listPaymentAccounts, listReceivableAccounts, listRevenueAccounts, listSuppliers, moveAccount, receivableAccountForStudentContext, revenueAccountForItem, suggestAccountCode, supplierAging, supplierProfile, supplierStatement, syncCustomersFromStudents, trialBalance, updateAccount, updateBank, updateCashbox, updateSupplier } from './accounting.js';
import { databaseStorage, logAudit, readDb, updateDb } from './db.js';
import { applyPaymentToAccount, ensureFinanceAccount, isVatExemptRegistration, money } from './finance.js';
import { createGoodsReceipt, createItem, createPurchaseOrder, createPurchaseRequest, createStockMovement, createWarehouse, inventoryDashboard, inventoryReports, issueItemToStudent, listGoodsReceipts, listInventoryCategories, listItems, listPurchaseOrders, listPurchaseRequests, listStockMovements, listWarehouses, updateItem, updatePurchaseOrderStatus, updatePurchaseRequestStatus, updateWarehouse } from './inventory.js';

const app = express();
const port = Number(process.env.PORT || 4300);
const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.RAWAFED_UPLOAD_DIR || (process.env.VERCEL ? join('/tmp', 'rawafed-uploads') : join(__dirname, '..', 'uploads'));
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://127.0.0.1:4200,http://localhost:4200')
  .split(',')
  .map((item) => item.trim());
const allowedUploadTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif'
]);

mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safeExt = extname(file.originalname || '').replace(/[^a-z0-9.]/gi, '').slice(0, 12);
      cb(null, `${Date.now()}-${randomUUID()}${safeExt}`);
    }
  }),
  fileFilter: (_req, file, cb) => {
    if (allowedUploadTypes.has(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported file type.'));
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet({
  crossOriginResourcePolicy: false
}));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(uploadDir));
app.use(standardizeApiResponses);

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'rawafed-backend',
    message: 'Backend API is running. Open the frontend at http://127.0.0.1:4200.',
    api: '/api',
    health: '/api/health'
  });
});

app.get('/api', (_req, res) => {
  res.json({
    ok: true,
    service: 'rawafed-backend',
    message: 'Rawafed backend API is running.',
    health: '/api/health',
    login: '/api/auth/login'
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'rawafed-backend',
    time: new Date().toISOString(),
    database: {
      engine: databaseStorage.engine,
      persistent: !databaseStorage.isEphemeral,
      dataDir: databaseStorage.dataDir
    }
  });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const body = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid login payload.' });
    return;
  }

  const db = readDb();
  const user = db.users.find((item) => item.username === body.data.username.trim().toLowerCase() && item.active);
  if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
    res.status(401).json({ message: 'Invalid username or password.' });
    return;
  }

  const refreshTokenId = randomUUID();
  const refreshToken = signRefreshToken(user, refreshTokenId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  updateDb((next) => {
    next.refreshTokens.unshift({
      id: refreshTokenId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      createdAt: now.toISOString()
    });
  });
  logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'login',
    entityType: 'user',
    entityId: user.id
  });

  res.json({
    token: signUser(user),
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    }
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/refresh', (req, res) => {
  const body = z.object({ refreshToken: z.string().min(20) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid refresh payload.' });
    return;
  }

  try {
    const decoded = verifyRefreshToken(body.data.refreshToken);
    if (decoded.type !== 'refresh') throw new Error('Invalid token type.');
    const db = readDb();
    const stored = db.refreshTokens.find((item) =>
      item.id === decoded.tokenId &&
      item.userId === decoded.sub &&
      item.tokenHash === hashToken(body.data.refreshToken) &&
      !item.revokedAt &&
      new Date(item.expiresAt).getTime() > Date.now()
    );
    const user = db.users.find((item) => item.id === decoded.sub && item.active);
    if (!stored || !user) {
      res.status(401).json({ message: 'Invalid refresh token.' });
      return;
    }
    res.json({ token: signUser(user), user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
  } catch {
    res.status(401).json({ message: 'Invalid refresh token.' });
  }
});

app.post('/api/auth/logout', requireAuth, (req: AuthRequest, res) => {
  const body = z.object({ refreshToken: z.string().optional() }).safeParse(req.body);
  updateDb((db) => {
    const now = new Date().toISOString();
    db.refreshTokens = db.refreshTokens.map((item) => {
      if (body.success && body.data.refreshToken && item.tokenHash !== hashToken(body.data.refreshToken)) return item;
      if (!body.success || !body.data.refreshToken) {
        if (item.userId !== req.user?.id) return item;
      }
      return { ...item, revokedAt: item.revokedAt || now };
    });
  });
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'logout', entityType: 'user', entityId: req.user?.id });
  res.status(204).send();
});

app.post('/api/public/uploads', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: 'No file uploaded.' });
    return;
  }

  const now = new Date().toISOString();
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const record = {
    id: randomUUID(),
    originalName: req.file.originalname,
    fileName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    url: `${baseUrl}/uploads/${encodeURIComponent(req.file.filename)}`,
    label: req.body.label ? String(req.body.label) : undefined,
    ownerId: req.body.ownerId ? String(req.body.ownerId) : undefined,
    uploadedBy: 'public-registration',
    createdAt: now
  };

  updateDb((db) => db.uploads.unshift(record));
  logAudit({ action: 'public upload document', entityType: 'upload', entityId: record.id, details: { label: record.label, mimeType: record.mimeType } });
  res.status(201).json(record);
});

app.post('/api/public/registrations', (req, res) => {
  const body = registrationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      message: 'Invalid registration payload.',
      fieldErrors: body.error.flatten().fieldErrors
    });
    return;
  }

  const submitted = persistRegistration(body.data);
  logAudit({
    action: 'public create registration',
    entityType: 'registration',
    entityId: submitted.id,
    details: { registrationNumber: submitted.registrationNumber, success: true }
  });
  res.status(201).json(submitted);
});

const roleSchema = z.enum(['Super Admin', 'Admissions', 'Finance', 'Principal', 'Registrar', 'Finance Manager', 'Chief Accountant', 'Accountant', 'Auditor']);
const coaReadRoles = ['Finance', 'Finance Manager', 'Chief Accountant', 'Accountant', 'Auditor'] as const;
const coaWriteRoles = ['Finance', 'Finance Manager', 'Chief Accountant'] as const;
const coaFullAccessRoles = ['Finance', 'Finance Manager'] as const;
const staffReadRoles = ['Finance', 'Finance Manager', 'Chief Accountant', 'Accountant', 'Auditor'] as const;
const payrollWriteRoles = ['Finance', 'Finance Manager', 'Chief Accountant', 'Accountant'] as const;
const registrationSchema = z.object({
  id: z.string().optional(),
  registrationNumber: z.string().optional(),
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'archived']).optional(),
  submittedAt: z.string().optional(),
  createdAt: z.string().optional(),
  student: z.object({
    englishName: z.string().optional().default(''),
    arabicName: z.string().optional().default(''),
    applyingGrade: z.string().optional().default(''),
    nationalId: z.string().optional().default(''),
    passportNumber: z.string().optional().default('')
  }).passthrough(),
  father: z.object({ fullName: z.string().optional(), phone: z.string().optional(), email: z.string().optional() }).passthrough().optional(),
  mother: z.object({ fullName: z.string().optional(), phone: z.string().optional(), email: z.string().optional() }).passthrough().optional(),
  financial: z.object({ grandTotal: z.number().optional() }).passthrough().optional()
}).passthrough();
const studentPatchSchema = z.object({
  englishName: z.string().min(1).optional(),
  arabicName: z.string().optional(),
  grade: z.string().min(1).optional(),
  nationalId: z.string().optional(),
  passportNumber: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().email().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'archived']).optional()
});
const staffSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  nameEn: z.string().optional(),
  employeeCode: z.string().optional(),
  position: z.string().min(1),
  jobTitle: z.string().optional(),
  department: z.string().min(1),
  branch: z.string().optional(),
  costCenter: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  manager: z.string().optional(),
  employmentType: z.string().optional(),
  salary: z.coerce.number().nonnegative().default(0),
  basicSalary: z.coerce.number().nonnegative().optional(),
  housingAllowance: z.coerce.number().nonnegative().optional(),
  transportationAllowance: z.coerce.number().nonnegative().optional(),
  otherAllowances: z.coerce.number().nonnegative().optional(),
  startDate: z.string().optional(),
  joiningDate: z.string().optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  probationEnd: z.string().optional(),
  nationality: z.string().optional(),
  idNumber: z.string().optional(),
  nationalId: z.string().optional(),
  bankName: z.string().optional(),
  iban: z.string().optional(),
  gosiNumber: z.string().optional(),
  gosiSalary: z.coerce.number().nonnegative().optional(),
  attachments: z.array(z.any()).optional(),
  photo: z.string().optional(),
  status: z.string().min(1).default('Active'),
  notes: z.string().optional()
});

app.get('/api/users', requireAuth, requireRole(['Super Admin']), (_req, res) => {
  res.json(readDb().users.map(safeUser));
});

app.post('/api/users', requireAuth, requireRole(['Super Admin']), async (req: AuthRequest, res) => {
  const body = z.object({
    username: z.string().min(3).max(60).transform((value) => value.trim().toLowerCase()),
    password: z.string().min(8),
    displayName: z.string().min(2),
    role: roleSchema
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ message: 'Invalid user payload.', errors: body.error.flatten() });
    return;
  }

  const now = new Date().toISOString();
  let created: any;
  updateDb((db) => {
    if (db.users.some((item) => item.username === body.data.username)) return;
    created = {
      id: randomUUID(),
      username: body.data.username,
      passwordHash: bcrypt.hashSync(body.data.password, 10),
      displayName: body.data.displayName,
      role: body.data.role,
      active: true,
      createdAt: now,
      updatedAt: now
    };
    db.users.unshift(created);
  });

  if (!created) {
    res.status(409).json({ message: 'Username already exists.' });
    return;
  }

  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create user', entityType: 'user', entityId: created.id });
  res.status(201).json(safeUser(created));
});

app.patch('/api/users/:id', requireAuth, requireRole(['Super Admin']), (req: AuthRequest, res) => {
  const body = z.object({
    displayName: z.string().min(2).optional(),
    role: roleSchema.optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid user payload.', errors: body.error.flatten() });
    return;
  }

  let updated: any;
  updateDb((db) => {
    db.users = db.users.map((item) => {
      if (item.id !== req.params.id) return item;
      updated = { ...item, ...body.data, updatedAt: new Date().toISOString() };
      return updated;
    });
  });
  if (!updated) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'update user', entityType: 'user', entityId: updated.id });
  res.json(safeUser(updated));
});

app.patch('/api/users/:id/password', requireAuth, requireRole(['Super Admin']), (req: AuthRequest, res) => {
  const body = z.object({ password: z.string().min(8) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid password payload.', errors: body.error.flatten() });
    return;
  }
  let updated: any;
  updateDb((db) => {
    db.users = db.users.map((item) => {
      if (item.id !== req.params.id) return item;
      updated = { ...item, passwordHash: bcrypt.hashSync(body.data.password, 10), updatedAt: new Date().toISOString() };
      return updated;
    });
    db.refreshTokens = db.refreshTokens.map((token) => token.userId === req.params.id ? { ...token, revokedAt: token.revokedAt || new Date().toISOString() } : token);
  });
  if (!updated) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'change user password', entityType: 'user', entityId: updated.id });
  res.json(safeUser(updated));
});

app.patch('/api/users/:id/status', requireAuth, requireRole(['Super Admin']), (req: AuthRequest, res) => {
  const body = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid status payload.', errors: body.error.flatten() });
    return;
  }
  let updated: any;
  updateDb((db) => {
    db.users = db.users.map((item) => {
      if (item.id !== req.params.id) return item;
      updated = { ...item, active: body.data.active, updatedAt: new Date().toISOString() };
      return updated;
    });
    if (!body.data.active) db.refreshTokens = db.refreshTokens.map((token) => token.userId === req.params.id ? { ...token, revokedAt: token.revokedAt || new Date().toISOString() } : token);
  });
  if (!updated) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'change user status', entityType: 'user', entityId: updated.id });
  res.json(safeUser(updated));
});

app.get('/api/registrations', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal']), (_req, res) => {
  const db = readDb();
  res.json(withFinancePaymentStatuses(db.registrations, db.financeAccounts));
});

app.post('/api/registrations', requireAuth, requireRole(['Admissions', 'Registrar']), (req: AuthRequest, res) => {
  const body = registrationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid registration payload.', errors: body.error.flatten() });
    return;
  }

  const submitted = persistRegistration(body.data);
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create registration', entityType: 'registration', entityId: submitted.id });

  res.status(201).json(submitted);
});

app.patch('/api/registrations/:id/status', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal']), (req, res) => {
  const status = z.enum(['draft', 'pending', 'approved', 'rejected', 'archived']).safeParse(req.body.status);
  if (!status.success) {
    res.status(400).json({ message: 'Invalid status.' });
    return;
  }

  let updated: any;
  updateDb((db) => {
    db.registrations = db.registrations.map((item) => {
      if (item.id !== req.params.id) return item;
      updated = { ...item, status: status.data, updatedAt: new Date().toISOString() };
      return updated;
    });
    if (updated && status.data === 'approved') createStudentFromRegistrationRecord(db, updated);
  });

  if (!updated) {
    res.status(404).json({ message: 'Registration not found.' });
    return;
  }

  if (status.data === 'approved') {
    syncCustomersFromStudents();
    logAudit({ actorId: (req as AuthRequest).user?.id, actorRole: (req as AuthRequest).user?.role, action: 'approve application', entityType: 'registration', entityId: updated.id });
  }
  res.json(updated);
});

app.get('/api/students', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal', 'Finance']), (_req, res) => {
  const db = readDb();
  res.json(withStudentFinancePaymentStatuses(db.students, db.financeAccounts));
});

app.get('/api/students/:id', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal', 'Finance']), (req, res) => {
  const student = readDb().students.find((item) => item.id === req.params.id);
  if (!student) {
    res.status(404).json({ message: 'Student not found.' });
    return;
  }
  res.json(student);
});

app.post('/api/students/from-registration/:registrationId', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal']), (req: AuthRequest, res) => {
  let student: any;
  updateDb((db) => {
    const registration = db.registrations.find((item) => item.id === req.params.registrationId);
    if (!registration) return;
    student = createStudentFromRegistrationRecord(db, registration);
  });
  if (!student) {
    res.status(404).json({ message: 'Registration not found.' });
    return;
  }
  ensureCustomerForStudent(student);
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create student', entityType: 'student', entityId: student.id });
  res.status(201).json(student);
});

app.patch('/api/students/:id', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal']), (req: AuthRequest, res) => {
  const body = studentPatchSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid student payload.', errors: body.error.flatten() });
    return;
  }

  let updated: any;
  updateDb((db) => {
    db.students = db.students.map((item) => {
      if (item.id !== req.params.id) return item;
      updated = { ...item, ...body.data, updatedAt: new Date().toISOString() };
      return updated;
    });
  });
  if (!updated) {
    res.status(404).json({ message: 'Student not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'update student', entityType: 'student', entityId: updated.id });
  res.json(updated);
});

app.delete('/api/students/:id', requireAuth, requireRole(['Super Admin']), (req: AuthRequest, res) => {
  updateDb((db) => {
    db.students = db.students.filter((item) => item.id !== req.params.id);
  });
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'delete student', entityType: 'student', entityId: String(req.params.id) });
  res.status(204).send();
});

app.get('/api/notifications', requireAuth, (req: AuthRequest, res) => {
  const role = req.user?.role;
  const notifications = readDb().notifications.filter((item) => item.targetRoles === 'all' || (role && item.targetRoles.includes(role)));
  res.json(notifications);
});

app.post('/api/notifications/:id/read', requireAuth, (req: AuthRequest, res) => {
  updateDb((db) => {
    const note = db.notifications.find((item) => item.id === req.params.id);
    if (note && req.user?.role && !note.readBy.includes(req.user.role)) note.readBy.push(req.user.role);
  });
  res.status(204).send();
});

app.post('/api/uploads', requireAuth, upload.single('file'), (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ message: 'No file uploaded.' });
    return;
  }

  const now = new Date().toISOString();
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const record = {
    id: randomUUID(),
    originalName: req.file.originalname,
    fileName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    url: `${baseUrl}/uploads/${encodeURIComponent(req.file.filename)}`,
    label: req.body.label ? String(req.body.label) : undefined,
    ownerId: req.body.ownerId ? String(req.body.ownerId) : undefined,
    uploadedBy: req.user?.id,
    createdAt: now
  };

  updateDb((db) => db.uploads.unshift(record));
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'upload document', entityType: 'upload', entityId: record.id, details: { label: record.label, mimeType: record.mimeType } });
  res.status(201).json(record);
});

app.delete('/api/uploads/:id', requireAuth, requireRole(['Super Admin']), (req, res) => {
  let removed: any;
  updateDb((db) => {
    removed = db.uploads.find((item) => item.id === req.params.id);
    db.uploads = db.uploads.filter((item) => item.id !== req.params.id);
  });

  if (!removed) {
    res.status(404).json({ message: 'Upload not found.' });
    return;
  }

  const filePath = join(uploadDir, removed.fileName || '');
  if (filePath.startsWith(uploadDir) && existsSync(filePath)) unlinkSync(filePath);
  res.status(204).send();
});

app.get('/api/admin/export', requireAuth, requireRole(['Super Admin']), (_req, res) => {
  const fileName = `rawafed-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.json(readDb());
});

app.get('/api/admin/integrity', requireAuth, requireRole(['Super Admin']), (_req, res) => {
  const db = readDb();
  const registrationIds = new Set(db.registrations.map((item: any) => item.id).filter(Boolean));
  const registrationNumbers = new Set(db.registrations.map((item: any) => item.registrationNumber).filter(Boolean));
  const studentIds = new Set(db.students.map((item: any) => item.id).filter(Boolean));
  const accountIds = new Set(db.financeAccounts.map((item: any) => item.id).filter(Boolean));
  const invoiceIds = new Set(db.financeInvoices.map((item: any) => item.id).filter(Boolean));
  const duplicates = (values: string[]) => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    values.filter(Boolean).forEach((value) => {
      if (seen.has(value)) repeated.add(value);
      seen.add(value);
    });
    return [...repeated];
  };
  const invoiceTotal = db.financeInvoices.reduce((sum, item: any) => sum + Number(item.total || 0), 0);
  const paymentTotal = db.financePayments.reduce((sum, item: any) => sum + Number(item.amount || 0), 0);
  const outstandingTotal = db.financeAccounts.reduce((sum, item: any) => sum + Number(item.remaining || 0), 0);

  res.json({
    generatedAt: new Date().toISOString(),
    database: {
      engine: databaseStorage.engine,
      persistent: !databaseStorage.isEphemeral,
      dataDir: databaseStorage.dataDir,
      warning: databaseStorage.isEphemeral ? 'Database is stored in an ephemeral directory. Records can disappear after restart or redeploy.' : ''
    },
    counts: {
      registrations: db.registrations.length,
      students: db.students.length,
      financeAccounts: db.financeAccounts.length,
      invoices: db.financeInvoices.length,
      payments: db.financePayments.length,
      expenses: db.financeExpenses.length,
      auditLogs: db.auditLogs.length
    },
    duplicates: {
      registrationNumbers: duplicates(db.registrations.map((item: any) => String(item.registrationNumber || ''))),
      receiptNumbers: duplicates(db.financePayments.map((item: any) => String(item.receiptNumber || ''))),
      invoiceNumbers: duplicates(db.financeInvoices.map((item: any) => String(item.invoiceNumber || '')))
    },
    orphanRecords: {
      studentsWithoutRegistration: db.students.filter((item: any) => item.registrationId && !registrationIds.has(item.registrationId)),
      accountsWithoutRegistration: db.financeAccounts.filter((item: any) => item.registrationId && !registrationIds.has(item.registrationId)),
      accountsWithoutStudent: db.financeAccounts.filter((item: any) => item.studentId && !studentIds.has(item.studentId)),
      paymentsWithoutAccount: db.financePayments.filter((item: any) => !accountIds.has(item.accountId)),
      paymentsWithoutInvoice: db.financePayments.filter((item: any) => item.invoiceId && !invoiceIds.has(item.invoiceId)),
      paymentsWithoutRegistration: db.financePayments.filter((item: any) => item.registrationId && !registrationIds.has(item.registrationId)),
      invoicesWithoutAccount: db.financeInvoices.filter((item: any) => item.accountId && !accountIds.has(item.accountId)),
      invoicesWithoutRegistration: db.financeInvoices.filter((item: any) =>
        (item.registrationId && !registrationIds.has(item.registrationId)) ||
        (!item.registrationId && item.registrationNumber && !registrationNumbers.has(item.registrationNumber))
      )
    },
    totals: {
      invoiceTotal: money(invoiceTotal),
      paymentTotal: money(paymentTotal),
      outstandingTotal: money(outstandingTotal),
      accountExpectedTotal: money(db.financeAccounts.reduce((sum, item: any) => sum + Number(item.expectedTotal || 0), 0)),
      accountPaidTotal: money(db.financeAccounts.reduce((sum, item: any) => sum + Number(item.paid || 0), 0))
    }
  });
});

app.post('/api/admin/announcements', requireAuth, requireRole(['Super Admin']), (req, res) => {
  const body = z.object({
    message: z.string().min(3),
    targetRoles: z.union([
      z.literal('all'),
      z.array(z.enum(['Super Admin', 'Admissions', 'Finance', 'Principal', 'Registrar'])).min(1)
    ]).default('all'),
    link: z.string().optional()
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ message: 'Invalid announcement payload.', errors: body.error.flatten() });
    return;
  }

  const notification = {
    id: randomUUID(),
    message: body.data.message,
    targetRoles: body.data.targetRoles,
    category: 'admin' as const,
    createdAt: new Date().toISOString(),
    readBy: [],
    link: body.data.link,
    sourceId: `admin-announcement:${Date.now()}`
  };

  updateDb((db) => db.notifications.unshift(notification));
  res.status(201).json(notification);
});

app.get('/api/accounting/accounts', requireAuth, requireRole([...coaReadRoles]), (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  const type = String(req.query.type || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim().toLowerCase();
  const accounts = listAccounts().filter((account) => {
    const matchesQuery = !query || [account.code, account.nameAr, account.nameEn, account.type].join(' ').toLowerCase().includes(query);
    const matchesType = !type || account.type === type;
    const matchesStatus = !status || account.status === status;
    return matchesQuery && matchesType && matchesStatus;
  });
  res.json(accounts);
});

app.get('/api/accounting/accounts/suggest-code', requireAuth, requireRole([...coaWriteRoles]), (req, res) => {
  res.json(suggestAccountCode(String(req.query.parentId || ''), String(req.query.type || 'asset')));
});

const accountSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId: z.string().optional(),
  normalBalance: z.enum(['debit', 'credit']).optional(),
  postingAccount: z.boolean().optional(),
  openingBalance: z.coerce.number().optional(),
  openingDate: z.string().optional(),
  currency: z.string().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  notes: z.string().optional(),
  isCashAccount: z.boolean().optional(),
  isBankAccount: z.boolean().optional(),
  isVatAccount: z.boolean().optional(),
  isReceivableAccount: z.boolean().optional(),
  isPayableAccount: z.boolean().optional()
});

app.post('/api/accounting/accounts', requireAuth, requireRole([...coaWriteRoles]), (req: AuthRequest, res) => {
  const body = accountSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid account payload.', errors: body.error.flatten() });
    return;
  }
  try {
    const account = createAccount(body.data);
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create account', entityType: 'accounting_account', entityId: account.id, details: { code: account.code } });
    res.status(201).json(account);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not create account.' });
  }
});

app.patch('/api/accounting/accounts/:id', requireAuth, requireRole([...coaWriteRoles]), (req: AuthRequest, res) => {
  try {
    const account = updateAccount(String(req.params.id), req.body || {});
    if (!account) {
      res.status(404).json({ message: 'Account not found.' });
      return;
    }
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'update account', entityType: 'accounting_account', entityId: account.id });
    res.json(account);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not update account.' });
  }
});

app.delete('/api/accounting/accounts/:id', requireAuth, requireRole([...coaFullAccessRoles]), (req: AuthRequest, res) => {
  try {
    const account = deleteAccount(String(req.params.id));
    if (!account) {
      res.status(404).json({ message: 'Account not found.' });
      return;
    }
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'delete account', entityType: 'accounting_account', entityId: account.id });
    res.json(account);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'This account cannot be deleted because accounting transactions already exist.' });
  }
});

app.patch('/api/accounting/accounts/:id/archive', requireAuth, requireRole([...coaFullAccessRoles]), (req: AuthRequest, res) => {
  const account = archiveAccount(String(req.params.id));
  if (!account) {
    res.status(404).json({ message: 'Account not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'archive account', entityType: 'accounting_account', entityId: account.id });
  res.json(account);
});

app.patch('/api/accounting/accounts/:id/move', requireAuth, requireRole([...coaWriteRoles]), (req: AuthRequest, res) => {
  const body = z.object({ parentId: z.string().optional().nullable() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid move payload.', errors: body.error.flatten() });
    return;
  }
  try {
    const account = moveAccount(String(req.params.id), body.data.parentId || null);
    if (!account) {
      res.status(404).json({ message: 'Account not found.' });
      return;
    }
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'move account', entityType: 'accounting_account', entityId: account.id, details: { parentId: body.data.parentId } });
    res.json(account);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not move account.' });
  }
});

app.get('/api/accounting/dashboard', requireAuth, requireRole([...coaReadRoles]), (req, res) => {
  res.json(accountingDashboard(String(req.query.fromDate || ''), String(req.query.toDate || '')));
});

app.get('/api/accounting/cost-centers', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listCostCenters());
});

app.get('/api/accounting/expense-accounts', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listExpenseAccounts());
});

app.get('/api/accounting/payment-accounts', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listPaymentAccounts());
});

app.get('/api/accounting/revenue-accounts', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listRevenueAccounts());
});

app.get('/api/accounting/receivable-accounts', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listReceivableAccounts());
});

app.get('/api/accounting/payable-accounts', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listPayableAccounts());
});

app.get('/api/accounting/cashboxes', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listCashboxes());
});

app.post('/api/accounting/cashboxes', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  try {
    const cashbox = createCashbox(req.body || {});
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create cashbox', entityType: 'accounting_cashbox', entityId: cashbox.id });
    res.status(201).json(cashbox);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not create cashbox.' });
  }
});

app.patch('/api/accounting/cashboxes/:id', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const cashbox = updateCashbox(String(req.params.id), req.body || {});
  if (!cashbox) {
    res.status(404).json({ message: 'Cashbox not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'update cashbox', entityType: 'accounting_cashbox', entityId: cashbox.id });
  res.json(cashbox);
});

app.get('/api/accounting/banks', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listBanks());
});

app.post('/api/accounting/banks', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  try {
    const bank = createBank(req.body || {});
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create bank', entityType: 'accounting_bank', entityId: bank.id });
    res.status(201).json(bank);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not create bank.' });
  }
});

app.patch('/api/accounting/banks/:id', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const bank = updateBank(String(req.params.id), req.body || {});
  if (!bank) {
    res.status(404).json({ message: 'Bank not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'update bank', entityType: 'accounting_bank', entityId: bank.id });
  res.json(bank);
});

app.post('/api/accounting/transfers', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    amount: z.coerce.number().positive(),
    date: z.string().min(8),
    referenceNumber: z.string().optional(),
    description: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid transfer payload.', errors: body.error.flatten() });
    return;
  }
  try {
    const entry = createCashBankTransfer(body.data, { id: req.user?.id, name: req.user?.displayName });
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'cash bank transfer', entityType: 'accounting_journal_entry', entityId: entry.id });
    res.status(201).json(entry);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not save transfer.' });
  }
});

app.get('/api/accounting/suppliers', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listSuppliers());
});

app.post('/api/accounting/suppliers', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    supplierCode: z.string().optional(),
    name: z.string().optional(),
    nameAr: z.string().optional(),
    nameEn: z.string().optional(),
    vatNumber: z.string().optional(),
    commercialRegistration: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    contactPerson: z.string().optional(),
    paymentTerms: z.string().optional(),
    openingBalance: z.coerce.number().optional(),
    payableAccountId: z.string().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    notes: z.string().optional()
  }).refine((value) => Boolean(value.name || value.nameEn || value.nameAr), { message: 'Supplier name is required.' }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ message: 'Invalid supplier payload.', errors: body.error.flatten() });
    return;
  }

  try {
    const supplier = createSupplier(body.data);
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create supplier', entityType: 'accounting_supplier', entityId: supplier.id, details: { supplierCode: supplier.supplierCode } });
    res.status(201).json(supplier);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not save supplier.' });
  }
});

app.patch('/api/accounting/suppliers/:id', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const supplier = updateSupplier(String(req.params.id), req.body || {});
  if (!supplier) {
    res.status(404).json({ message: 'Supplier not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'update supplier', entityType: 'accounting_supplier', entityId: supplier.id });
  res.json(supplier);
});

app.delete('/api/accounting/suppliers/:id', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const supplier = deactivateSupplier(String(req.params.id));
  if (!supplier) {
    res.status(404).json({ message: 'Supplier not found.' });
    return;
  }
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'deactivate supplier', entityType: 'accounting_supplier', entityId: supplier.id });
  res.json(supplier);
});

app.get('/api/accounting/journal-entries', requireAuth, requireRole([...coaReadRoles]), (_req, res) => {
  res.json(listJournalEntries());
});

app.post('/api/accounting/journal-entries', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    referenceNumber: z.string().optional(),
    postingDate: z.string().min(8),
    description: z.string().min(3),
    status: z.enum(['draft', 'posted']).optional(),
    lines: z.array(z.object({
      accountId: z.string().min(1),
      costCenterId: z.string().optional(),
      description: z.string().optional(),
      debit: z.coerce.number().nonnegative().optional(),
      credit: z.coerce.number().nonnegative().optional()
    })).min(2)
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ message: 'Invalid journal entry payload.', errors: body.error.flatten() });
    return;
  }

  try {
    const entry = createJournalEntry(body.data, { id: req.user?.id, name: req.user?.displayName });
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create journal entry', entityType: 'accounting_journal_entry', entityId: entry.id, details: { entryNumber: entry.entryNumber, status: entry.status } });
    res.status(201).json(entry);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not create journal entry.' });
  }
});

app.get('/api/accounting/ledger/:accountId', requireAuth, requireRole([...coaReadRoles]), (req, res) => {
  const result = ledger(String(req.params.accountId), String(req.query.fromDate || ''), String(req.query.toDate || ''));
  if (!result) {
    res.status(404).json({ message: 'Account not found.' });
    return;
  }
  res.json(result);
});

app.get('/api/accounting/trial-balance', requireAuth, requireRole([...coaReadRoles]), (req, res) => {
  res.json(trialBalance({
    fromDate: String(req.query.fromDate || ''),
    toDate: String(req.query.toDate || ''),
    displayMode: String(req.query.displayMode || 'activity') as any,
    accountType: String(req.query.accountType || ''),
    parentAccountId: String(req.query.parentAccountId || ''),
    branch: String(req.query.branch || ''),
    costCenterId: String(req.query.costCenterId || ''),
    currency: String(req.query.currency || ''),
    accountStatus: String(req.query.accountStatus || ''),
    search: String(req.query.search || ''),
    showZeroBalances: String(req.query.showZeroBalances || '') === 'true',
    showParentAccounts: String(req.query.showParentAccounts || '') === 'true'
  }));
});

app.get('/api/accounting/customers', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(syncCustomersFromStudents());
});

app.get('/api/accounting/customers/:id', requireAuth, requireRole(['Finance']), (req, res) => {
  const customer = customerById(String(req.params.id));
  if (!customer) {
    res.status(404).json({ message: 'Customer not found.' });
    return;
  }
  res.json(customer);
});

app.get('/api/accounting/customers/:id/statement', requireAuth, requireRole(['Finance']), (req, res) => {
  const statement = customerStatement(String(req.params.id), String(req.query.fromDate || ''), String(req.query.toDate || ''));
  if (!statement) {
    res.status(404).json({ message: 'Customer not found.' });
    return;
  }
  res.json(statement);
});

app.get('/api/accounting/customers/:id/installments', requireAuth, requireRole(['Finance']), (req, res) => {
  const customer = customerById(String(req.params.id));
  if (!customer) {
    res.status(404).json({ message: 'Customer not found.' });
    return;
  }
  res.json(customerInstallments(String(req.params.id)));
});

app.post('/api/accounting/customers/:id/installment-plans', requireAuth, requireRole(['Finance']), (req, res) => {
  const body = z.object({
    planType: z.enum(['Annual Tuition', 'Semester', 'Monthly', 'Custom']).default('Custom'),
    name: z.string().optional(),
    totalAmount: z.coerce.number().positive(),
    startDate: z.string(),
    installmentsCount: z.coerce.number().int().positive().optional(),
    lateFeeType: z.string().optional(),
    lateFeeValue: z.coerce.number().nonnegative().optional(),
    gracePeriodDays: z.coerce.number().int().nonnegative().optional(),
    notes: z.string().optional(),
    installments: z.array(z.object({ dueDate: z.string(), amount: z.coerce.number().positive() })).optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid installment plan payload.', errors: body.error.flatten() });
    return;
  }
  const result = createInstallmentPlan(String(req.params.id), body.data);
  if (!result) {
    res.status(404).json({ message: 'Customer not found.' });
    return;
  }
  res.status(201).json(result);
});

app.get('/api/accounting/suppliers/:id/profile', requireAuth, requireRole(['Finance']), (req, res) => {
  const profile = supplierProfile(String(req.params.id));
  if (!profile) {
    res.status(404).json({ message: 'Supplier not found.' });
    return;
  }
  res.json(profile);
});

app.get('/api/accounting/suppliers/:id/statement', requireAuth, requireRole(['Finance']), (req, res) => {
  const statement = supplierStatement(String(req.params.id), String(req.query.fromDate || ''), String(req.query.toDate || ''));
  if (!statement) {
    res.status(404).json({ message: 'Supplier not found.' });
    return;
  }
  res.json(statement);
});

app.post('/api/accounting/supplier-payments', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    supplierId: z.string(),
    paymentType: z.enum(['full', 'partial', 'advance']).default('partial'),
    amount: z.coerce.number().positive(),
    paymentAccountId: z.string().optional(),
    paymentMethod: z.enum(['Cash', 'Bank Transfer', 'Card', 'Online']).default('Cash'),
    paidAt: z.string().default(new Date().toISOString().slice(0, 10)),
    notes: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid supplier payment payload.', errors: body.error.flatten() });
    return;
  }
  try {
    const profile = createSupplierPayment(body.data, { id: req.user?.id, name: req.user?.displayName });
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'supplier payment', entityType: 'accounting_supplier', entityId: body.data.supplierId, details: { amount: body.data.amount } });
    res.status(201).json(profile);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not save supplier payment.' });
  }
});

app.get('/api/accounting/supplier-aging', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(supplierAging());
});

app.get('/api/accounting/search', requireAuth, requireRole([...coaReadRoles]), (req, res) => {
  res.json(globalAccountingSearch(String(req.query.q || '')));
});

app.get('/api/inventory/dashboard', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(inventoryDashboard());
});

app.get('/api/inventory/categories', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(listInventoryCategories());
});

app.get('/api/inventory/warehouses', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(listWarehouses());
});

app.post('/api/inventory/warehouses', requireAuth, requireRole(['Finance']), (req, res) => {
  const body = z.object({
    code: z.string().optional(),
    name: z.string().min(1),
    nameAr: z.string().optional(),
    nameEn: z.string().optional(),
    location: z.string().optional(),
    responsibleEmployee: z.string().optional(),
    description: z.string().optional(),
    status: z.string().default('active')
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid warehouse payload.', errors: body.error.flatten() });
    return;
  }
  res.status(201).json(createWarehouse(body.data));
});

app.patch('/api/inventory/warehouses/:id', requireAuth, requireRole(['Finance']), (req, res) => {
  const updated = updateWarehouse(String(req.params.id), req.body || {});
  if (!updated) {
    res.status(404).json({ message: 'Warehouse not found.' });
    return;
  }
  res.json(updated);
});

app.get('/api/inventory/items', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(listItems());
});

app.post('/api/inventory/items', requireAuth, requireRole(['Finance']), (req, res) => {
  const body = z.object({
    itemCode: z.string().optional(),
    nameAr: z.string().optional(),
    nameEn: z.string().min(1),
    category: z.string().min(1),
    subcategory: z.string().optional(),
    unit: z.string().default('Each'),
    barcode: z.string().optional(),
    qrCode: z.string().optional(),
    purchasePrice: z.coerce.number().nonnegative().default(0),
    sellingPrice: z.coerce.number().nonnegative().default(0),
    vatType: z.string().default('Taxable'),
    minimumStock: z.coerce.number().nonnegative().default(0),
    maximumStock: z.coerce.number().nonnegative().default(0),
    reorderPoint: z.coerce.number().nonnegative().default(0),
    safetyStock: z.coerce.number().nonnegative().default(0),
    openingQuantity: z.coerce.number().nonnegative().default(0),
    openingValue: z.coerce.number().nonnegative().default(0),
    defaultWarehouseId: z.string().optional(),
    supplierId: z.string().optional(),
    brand: z.string().optional(),
    description: z.string().optional(),
    taxable: z.boolean().optional(),
    vatRate: z.coerce.number().nonnegative().default(15),
    status: z.string().default('active'),
    images: z.array(z.any()).optional(),
    attachments: z.array(z.any()).optional(),
    notes: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid item payload.', errors: body.error.flatten() });
    return;
  }
  try {
    res.status(201).json(createItem(body.data));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not save item.' });
  }
});

app.patch('/api/inventory/items/:id', requireAuth, requireRole(['Finance']), (req, res) => {
  const updated = updateItem(String(req.params.id), req.body || {});
  if (!updated) {
    res.status(404).json({ message: 'Item not found.' });
    return;
  }
  res.json(updated);
});

app.get('/api/inventory/movements', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(listStockMovements());
});

app.post('/api/inventory/movements', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    movementType: z.enum(['Stock In', 'Stock Out', 'Transfer', 'Adjustment', 'Return', 'Damage', 'Write-off']),
    date: z.string(),
    referenceNo: z.string().optional(),
    itemId: z.string(),
    quantity: z.coerce.number(),
    unitCost: z.coerce.number().nonnegative(),
    warehouseId: z.string(),
    toWarehouseId: z.string().optional(),
    reason: z.string().optional(),
    attachmentUploadId: z.string().optional(),
    attachmentFileName: z.string().optional(),
    attachmentUrl: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid stock movement payload.', errors: body.error.flatten() });
    return;
  }
  try {
    res.status(201).json(createStockMovement(body.data, { id: req.user?.id, name: req.user?.displayName }));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not save stock movement.' });
  }
});

app.get('/api/inventory/purchase-requests', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(listPurchaseRequests());
});

app.post('/api/inventory/purchase-requests', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    requestNo: z.string().optional(),
    department: z.string().min(1),
    requestedBy: z.string().min(1),
    reason: z.string().optional(),
    priority: z.string().default('Normal'),
    expectedDate: z.string().optional(),
    status: z.string().default('Draft'),
    items: z.array(z.object({ itemId: z.string(), quantity: z.coerce.number().positive(), reason: z.string().optional() })).min(1)
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid purchase request payload.', errors: body.error.flatten() });
    return;
  }
  res.status(201).json(createPurchaseRequest(body.data, { id: req.user?.id, name: req.user?.displayName }));
});

app.patch('/api/inventory/purchase-requests/:id/status', requireAuth, requireRole(['Finance']), (req, res) => {
  const status = z.object({ status: z.enum(['Draft', 'Submitted', 'Approved', 'Rejected', 'Converted to Purchase Order']) }).safeParse(req.body);
  if (!status.success) {
    res.status(400).json({ message: 'Invalid status payload.', errors: status.error.flatten() });
    return;
  }
  res.json(updatePurchaseRequestStatus(String(req.params.id), status.data.status));
});

app.get('/api/inventory/purchase-orders', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(listPurchaseOrders());
});

app.post('/api/inventory/purchase-orders', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    poNumber: z.string().optional(),
    requestId: z.string().optional(),
    supplierId: z.string().optional(),
    deliveryDate: z.string().optional(),
    paymentTerms: z.string().optional(),
    status: z.string().default('Draft'),
    items: z.array(z.object({ itemId: z.string(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().nonnegative(), vatRate: z.coerce.number().nonnegative().default(15) })).min(1)
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid purchase order payload.', errors: body.error.flatten() });
    return;
  }
  res.status(201).json(createPurchaseOrder(body.data, { id: req.user?.id, name: req.user?.displayName }));
});

app.patch('/api/inventory/purchase-orders/:id/status', requireAuth, requireRole(['Finance']), (req, res) => {
  const status = z.object({ status: z.enum(['Draft', 'Approved', 'Sent', 'Partially Received', 'Received', 'Cancelled']) }).safeParse(req.body);
  if (!status.success) {
    res.status(400).json({ message: 'Invalid status payload.', errors: status.error.flatten() });
    return;
  }
  res.json(updatePurchaseOrderStatus(String(req.params.id), status.data.status));
});

app.get('/api/inventory/goods-receipts', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(listGoodsReceipts());
});

app.post('/api/inventory/goods-receipts', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    grnNumber: z.string().optional(),
    poId: z.string().optional(),
    supplierId: z.string().optional(),
    warehouseId: z.string(),
    receivedDate: z.string(),
    supplierInvoiceNo: z.string().optional(),
    items: z.array(z.object({ poLineId: z.string().optional(), itemId: z.string(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().nonnegative(), vatRate: z.coerce.number().nonnegative().default(15) })).optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid GRN payload.', errors: body.error.flatten() });
    return;
  }
  try {
    res.status(201).json(createGoodsReceipt(body.data, { id: req.user?.id, name: req.user?.displayName }));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not save GRN.' });
  }
});

app.post('/api/inventory/student-issues', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    customerId: z.string(),
    itemId: z.string(),
    warehouseId: z.string(),
    quantity: z.coerce.number().positive(),
    date: z.string(),
    billable: z.boolean().default(false),
    sellingPrice: z.coerce.number().nonnegative().optional(),
    reason: z.string().optional(),
    referenceNo: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid student issue payload.', errors: body.error.flatten() });
    return;
  }
  try {
    res.status(201).json(issueItemToStudent(body.data, { id: req.user?.id, name: req.user?.displayName }));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not issue item.' });
  }
});

app.get('/api/inventory/reports', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(inventoryReports());
});

app.get('/api/finance/accounts', requireAuth, requireRole(['Finance']), (_req, res) => {
  const db = readDb();
  res.json(withVatRulesOnAccounts(db.financeAccounts, db.registrations));
});

app.get('/api/finance/payments', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(readDb().financePayments);
});

app.post('/api/finance/payments', requireAuth, requireRole(['Finance']), (req: AuthRequest, res) => {
  const body = z.object({
    accountId: z.string(),
    paymentItem: z.string().default('School Fees'),
    amount: z.number().positive(),
    method: z.string().default('Cash'),
    paidAt: z.string().optional(),
    referenceNumber: z.string().optional(),
    notes: z.string().optional()
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ message: 'Invalid payment payload.', errors: body.error.flatten() });
    return;
  }

  const now = new Date().toISOString();
  let created: any;
  updateDb((db) => {
    const account = db.financeAccounts.find((item) => item.id === body.data.accountId);
    if (!account) return;
    const registration = registrationForAccount(db, account);
    applyVatRulesToAccount(account, registration);

    applyPaymentToAccount(account, body.data.amount);
    syncRegistrationPaymentStatus(db, account);
    const vatExempt = isVatExemptRegistration(registration);
    const vat = vatExempt ? 0 : money(body.data.amount - body.data.amount / 1.15);
    const amountBeforeVat = money(body.data.amount - vat);
    const invoice = {
      id: randomUUID(),
      accountId: account.id,
      registrationId: account.registrationId,
      registrationNumber: account.registrationNumber,
      invoiceNumber: `INV-${Date.now()}`,
      studentName: account.studentName,
      feeItem: body.data.paymentItem,
      amountBeforeVat,
      vat,
      total: money(body.data.amount),
      paid: money(body.data.amount),
      remaining: account.remaining,
      paymentMethod: body.data.method,
      status: 'Paid' as const,
      issuedAt: body.data.paidAt || now,
      createdAt: now
    };
    const payment = {
      id: randomUUID(),
      accountId: account.id,
      registrationId: account.registrationId,
      registrationNumber: account.registrationNumber,
      receiptNumber: `REC-${Date.now()}`,
      paymentItem: body.data.paymentItem,
      amount: money(body.data.amount),
      method: body.data.method,
      paidAt: body.data.paidAt || now,
      collectedBy: req.user?.displayName || 'Finance',
      referenceNumber: body.data.referenceNumber,
      notes: body.data.notes,
      invoiceId: invoice.id,
      createdAt: now
    };
    db.financeInvoices.unshift(invoice);
    db.financePayments.unshift(payment);
    created = { payment, account, invoice };
  });

  if (!created) {
    res.status(404).json({ message: 'Finance account not found.' });
    return;
  }

  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'add payment', entityType: 'finance_payment', entityId: created.payment.id, details: { accountId: body.data.accountId, amount: body.data.amount } });
  logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'create invoice', entityType: 'finance_invoice', entityId: created.invoice.id });
  const studentReceivableAccountId = receivableAccountForStudentContext(created.account);
  createSystemJournal({
    referenceNumber: created.invoice.invoiceNumber,
    postingDate: created.invoice.issuedAt,
    description: `Sales invoice ${created.invoice.invoiceNumber}`,
    sourceType: 'finance_invoice',
    sourceId: created.invoice.id,
    lines: [
      { accountId: studentReceivableAccountId, debit: created.invoice.total, description: created.account.studentName },
      { accountId: revenueAccountForItem(created.invoice.feeItem), credit: created.invoice.amountBeforeVat, description: created.invoice.feeItem },
      ...(created.invoice.vat > 0 ? [{ accountId: accountIdBySystemKey('vat-payable'), credit: created.invoice.vat, description: 'Output VAT' }] : [])
    ]
  }, { id: req.user?.id, name: req.user?.displayName });
  createSystemJournal({
    referenceNumber: created.payment.receiptNumber,
    postingDate: created.payment.paidAt,
    description: `Receipt ${created.payment.receiptNumber}`,
    sourceType: 'finance_payment',
    sourceId: created.payment.id,
    lines: [
      { accountId: cashAccountForMethod(created.payment.method), debit: created.payment.amount, description: created.payment.method },
      { accountId: studentReceivableAccountId, credit: created.payment.amount, description: created.payment.paymentItem }
    ]
  }, { id: req.user?.id, name: req.user?.displayName });
  res.status(201).json(created);
});

app.get('/api/finance/invoices', requireAuth, requireRole(['Finance']), (_req, res) => {
  const db = readDb();
  res.json(withVatRulesOnInvoices(db.financeInvoices, db.registrations));
});

app.get('/api/finance/expenses', requireAuth, requireRole(['Finance']), (_req, res) => {
  const erpExpenses = listAccountingExpenses();
  if (erpExpenses.length) {
    res.json(erpExpenses);
    return;
  }
  res.json(readDb().financeExpenses);
});

app.post('/api/finance/invoices', requireAuth, requireRole(['Finance']), (req, res) => {
  const body = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    accountId: z.union([z.string(), z.number()]).optional(),
    registrationId: z.string().optional(),
    registrationNumber: z.string().optional(),
    invoiceNumber: z.string().optional(),
    patient: z.string().optional(),
    studentName: z.string().optional(),
    feeItem: z.string().optional(),
    service: z.string().optional(),
    amountBeforeVat: z.coerce.number().optional(),
    amount: z.coerce.number().optional(),
    vat: z.coerce.number().optional(),
    total: z.coerce.number().optional(),
    paid: z.coerce.number().optional(),
    remaining: z.coerce.number().optional(),
    paymentMethod: z.string().optional(),
    status: z.enum(['Pending', 'Paid']).optional(),
    date: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid invoice payload.', errors: body.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  const db = readDb();
  const registration = body.data.registrationId
    ? db.registrations.find((item) => item.id === body.data.registrationId)
    : db.registrations.find((item) => item.registrationNumber === body.data.registrationNumber);
  const vatExempt = isVatExemptRegistration(registration);
  const amount = money(body.data.amountBeforeVat ?? body.data.amount);
  const vat = vatExempt ? 0 : money(body.data.vat);
  const total = vatExempt ? amount : money(body.data.total ?? body.data.amount);
  const invoice = {
    id: String(body.data.id || randomUUID()),
    accountId: body.data.accountId ? String(body.data.accountId) : undefined,
    registrationId: body.data.registrationId,
    registrationNumber: body.data.registrationNumber,
    invoiceNumber: String(body.data.invoiceNumber || `INV-${Date.now()}`),
    studentName: String(body.data.patient || body.data.studentName || ''),
    feeItem: String(body.data.feeItem || body.data.service || 'School Fees'),
    amountBeforeVat: amount,
    vat,
    total,
    paid: money(body.data.paid),
    remaining: money(body.data.remaining),
    paymentMethod: String(body.data.paymentMethod || 'Cash'),
    status: body.data.status === 'Paid' ? 'Paid' as const : 'Pending' as const,
    issuedAt: String(body.data.date || now),
    createdAt: now
  };
  updateDb((db) => db.financeInvoices.unshift(invoice));
  logAudit({ actorId: (req as AuthRequest).user?.id, actorRole: (req as AuthRequest).user?.role, action: 'create invoice', entityType: 'finance_invoice', entityId: invoice.id });
  createSystemJournal({
    referenceNumber: invoice.invoiceNumber,
    postingDate: invoice.issuedAt,
    description: `Sales invoice ${invoice.invoiceNumber}`,
    sourceType: 'finance_invoice',
    sourceId: invoice.id,
    lines: [
      { accountId: receivableAccountForStudentContext(invoice), debit: invoice.total, description: invoice.studentName },
      { accountId: revenueAccountForItem(invoice.feeItem), credit: invoice.amountBeforeVat, description: invoice.feeItem },
      ...(invoice.vat > 0 ? [{ accountId: accountIdBySystemKey('vat-payable'), credit: invoice.vat, description: 'Output VAT' }] : [])
    ]
  }, { id: (req as AuthRequest).user?.id, name: (req as AuthRequest).user?.displayName });
  res.status(201).json(invoice);
});

app.post('/api/finance/expenses', requireAuth, requireRole(['Finance']), (req, res) => {
  const body = z.object({
    supplierId: z.string().optional(),
    expenseAccountId: z.string().optional(),
    category: z.string().optional(),
    invoiceType: z.enum(['Tax Invoice', 'Non Tax Invoice', 'Simplified Tax Invoice', 'Receipt Only', 'No Invoice']).default('Tax Invoice'),
    supplierInvoiceNumber: z.string().optional(),
    description: z.string().optional(),
    title: z.string().optional(),
    costCenterId: z.string().optional(),
    amountBeforeVat: z.coerce.number().nonnegative().optional(),
    amount: z.coerce.number().nonnegative().optional(),
    vatRate: z.coerce.number().nonnegative().default(15),
    vatAmount: z.coerce.number().nonnegative().optional(),
    totalAmount: z.coerce.number().nonnegative().optional(),
    paymentStatus: z.enum(['Paid', 'Unpaid', 'Partially Paid']).optional(),
    status: z.string().optional(),
    paymentMethod: z.enum(['Cash', 'Bank Transfer', 'Card', 'Online']).optional(),
    paymentFromAccountId: z.string().optional(),
    paidAmount: z.coerce.number().nonnegative().optional(),
    attachmentUploadId: z.string().optional(),
    attachmentFileName: z.string().optional(),
    attachmentUrl: z.string().optional(),
    date: z.string().optional(),
    expenseDate: z.string().optional(),
    notes: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid expense payload.', errors: body.error.flatten() });
    return;
  }
  const data = body.data;
  const amountBeforeVat = money(data.amountBeforeVat ?? data.amount ?? 0);
  const vatAmount = ['Tax Invoice', 'Simplified Tax Invoice'].includes(data.invoiceType)
    ? money(data.vatAmount ?? amountBeforeVat * (Number(data.vatRate || 0) / 100))
    : 0;
  try {
    const expense = createAccountingExpense({
      supplierId: data.supplierId,
      expenseAccountId: data.expenseAccountId || expenseAccountForCategory(data.category || 'Miscellaneous'),
      invoiceType: data.invoiceType,
      supplierInvoiceNumber: data.supplierInvoiceNumber,
      description: data.description || data.title || 'Expense',
      costCenterId: data.costCenterId,
      amountBeforeVat,
      vatRate: data.invoiceType === 'Tax Invoice' || data.invoiceType === 'Simplified Tax Invoice' ? Number(data.vatRate || 0) : 0,
      vatAmount,
      paymentStatus: data.paymentStatus || (data.status === 'Pending' ? 'Unpaid' : 'Paid'),
      paymentMethod: data.paymentMethod || 'Cash',
      paymentFromAccountId: data.paymentFromAccountId,
      paidAmount: data.paidAmount,
      attachmentUploadId: data.attachmentUploadId,
      attachmentFileName: data.attachmentFileName,
      attachmentUrl: data.attachmentUrl,
      expenseDate: String(data.expenseDate || data.date || new Date().toISOString().slice(0, 10)),
      notes: data.notes
    }, { id: (req as AuthRequest).user?.id, name: (req as AuthRequest).user?.displayName });
    logAudit({ actorId: (req as AuthRequest).user?.id, actorRole: (req as AuthRequest).user?.role, action: 'create expense', entityType: 'accounting_expense', entityId: expense.id, details: { amount: expense.totalAmount, expenseNo: expense.expenseNo } });
    res.status(201).json(expense);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not save expense.' });
  }
});

app.get('/api/staff', requireAuth, requireRole([...staffReadRoles]), (_req, res) => {
  res.json(readDb().staff);
});

app.post('/api/staff', requireAuth, requireRole([...payrollWriteRoles]), (req, res) => {
  const body = staffSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid staff payload.', errors: body.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  const baseSalary = money(body.data.basicSalary ?? body.data.salary);
  const totalSalary = money(baseSalary + Number(body.data.housingAllowance || 0) + Number(body.data.transportationAllowance || 0) + Number(body.data.otherAllowances || 0));
  const staff = {
    id: randomUUID(),
    employeeCode: body.data.employeeCode || `EMP-${Date.now()}`,
    name: body.data.name,
    nameAr: body.data.nameAr,
    nameEn: body.data.nameEn || body.data.name,
    position: body.data.position,
    jobTitle: body.data.jobTitle || body.data.position,
    department: body.data.department,
    branch: body.data.branch,
    costCenter: body.data.costCenter,
    gender: body.data.gender,
    dateOfBirth: body.data.dateOfBirth,
    phone: body.data.phone,
    mobile: body.data.mobile || body.data.phone,
    email: body.data.email,
    address: body.data.address,
    emergencyContact: body.data.emergencyContact,
    manager: body.data.manager,
    employmentType: body.data.employmentType,
    salary: totalSalary,
    basicSalary: baseSalary,
    housingAllowance: money(body.data.housingAllowance || 0),
    transportationAllowance: money(body.data.transportationAllowance || 0),
    otherAllowances: money(body.data.otherAllowances || 0),
    startDate: body.data.startDate || body.data.joiningDate,
    joiningDate: body.data.joiningDate || body.data.startDate,
    contractStart: body.data.contractStart,
    contractEnd: body.data.contractEnd,
    probationEnd: body.data.probationEnd,
    nationality: body.data.nationality,
    idNumber: body.data.idNumber || body.data.nationalId,
    nationalId: body.data.nationalId || body.data.idNumber,
    bankName: body.data.bankName,
    iban: body.data.iban,
    gosiNumber: body.data.gosiNumber,
    gosiSalary: money(body.data.gosiSalary || baseSalary),
    attachments: body.data.attachments || [],
    photo: body.data.photo,
    status: body.data.status,
    notes: body.data.notes,
    createdAt: now,
    updatedAt: now
  };
  updateDb((db) => db.staff.unshift(staff));
  res.status(201).json(staff);
});

app.patch('/api/staff/:id', requireAuth, requireRole([...payrollWriteRoles]), (req, res) => {
  const body = staffSchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid staff payload.', errors: body.error.flatten() });
    return;
  }
  let updated: any;
  updateDb((db) => {
    db.staff = db.staff.map((item) => {
      if (item.id !== req.params.id) return item;
      updated = {
        ...item,
        ...body.data,
        salary: body.data.salary === undefined ? item.salary : money(body.data.salary),
        updatedAt: new Date().toISOString()
      };
      return updated;
    });
  });
  if (!updated) {
    res.status(404).json({ message: 'Staff member not found.' });
    return;
  }
  res.json(updated);
});

app.delete('/api/staff/:id', requireAuth, requireRole([...payrollWriteRoles]), (req, res) => {
  updateDb((db) => {
    db.staff = db.staff.filter((item) => item.id !== req.params.id);
  });
  res.status(204).send();
});

app.get('/api/payroll/runs', requireAuth, requireRole([...staffReadRoles]), (_req, res) => {
  const runs = ((readDb().settings as any).payrollRuns || []) as any[];
  res.json(runs);
});

app.post('/api/payroll/runs', requireAuth, requireRole([...payrollWriteRoles]), (req: AuthRequest, res) => {
  const body = z.object({
    period: z.string().min(7),
    paymentDate: z.string().min(8),
    employees: z.array(z.object({
      employeeId: z.string(),
      employeeName: z.string().optional(),
      basicSalary: z.coerce.number().nonnegative().default(0),
      housingAllowance: z.coerce.number().nonnegative().default(0),
      transportationAllowance: z.coerce.number().nonnegative().default(0),
      otherAllowances: z.coerce.number().nonnegative().default(0),
      overtime: z.coerce.number().nonnegative().default(0),
      bonus: z.coerce.number().nonnegative().default(0),
      absenceDeduction: z.coerce.number().nonnegative().default(0),
      lateDeduction: z.coerce.number().nonnegative().default(0),
      loanDeduction: z.coerce.number().nonnegative().default(0),
      advanceDeduction: z.coerce.number().nonnegative().default(0),
      gosiEmployee: z.coerce.number().nonnegative().default(0),
      gosiEmployer: z.coerce.number().nonnegative().default(0),
      otherDeductions: z.coerce.number().nonnegative().default(0)
    })).min(1),
    status: z.enum(['Draft', 'Submitted', 'Approved', 'Posted', 'Paid']).default('Posted')
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid payroll run payload.', errors: body.error.flatten() });
    return;
  }

  try {
    const lines = body.data.employees.map((employee) => {
      const gross = money(employee.basicSalary + employee.housingAllowance + employee.transportationAllowance + employee.otherAllowances + employee.overtime + employee.bonus);
      const deductions = money(employee.absenceDeduction + employee.lateDeduction + employee.loanDeduction + employee.advanceDeduction + employee.gosiEmployee + employee.otherDeductions);
      const net = money(gross - deductions);
      return { ...employee, gross, deductions, net };
    });
    const grossTotal = money(lines.reduce((sum, line) => sum + line.gross, 0));
    const deductionsTotal = money(lines.reduce((sum, line) => sum + line.deductions, 0));
    const employerGosiTotal = money(lines.reduce((sum, line) => sum + Number(line.gosiEmployer || 0), 0));
    const netTotal = money(lines.reduce((sum, line) => sum + line.net, 0));
    const journalLines = [
      { accountId: accountIdBySystemKey('expense-salaries'), debit: grossTotal, description: `Payroll ${body.data.period}` },
      ...(employerGosiTotal > 0 ? [{ accountId: accountIdBySystemKey('expense-social-insurance'), debit: employerGosiTotal, description: `Employer GOSI ${body.data.period}` }] : []),
      { accountId: accountIdBySystemKey('salaries-payable'), credit: netTotal, description: `Net salaries ${body.data.period}` },
      ...((deductionsTotal + employerGosiTotal) > 0 ? [{ accountId: accountIdBySystemKey('accounts-payable'), credit: money(deductionsTotal + employerGosiTotal), description: `Payroll deductions and GOSI ${body.data.period}` }] : [])
    ];
    const journal = createSystemJournal({
      referenceNumber: `PAY-${body.data.period}-${Date.now()}`,
      postingDate: body.data.paymentDate,
      description: `Payroll run ${body.data.period}`,
      sourceType: 'payroll_run',
      sourceId: randomUUID(),
      lines: journalLines
    }, { id: req.user?.id, name: req.user?.displayName });
    const run = {
      id: randomUUID(),
      period: body.data.period,
      paymentDate: body.data.paymentDate,
      status: body.data.status,
      grossTotal,
      deductionsTotal,
      employerGosiTotal,
      netTotal,
      journalEntryId: journal.id,
      journalEntryNo: journal.entryNumber,
      employees: lines,
      createdBy: req.user?.id,
      createdAt: new Date().toISOString()
    };
    updateDb((db) => {
      const settings = db.settings as any;
      settings.payrollRuns = [run, ...(settings.payrollRuns || [])];
    });
    logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'post payroll run', entityType: 'payroll_run', entityId: run.id, details: { period: run.period, netTotal: run.netTotal, journalEntryNo: run.journalEntryNo } });
    res.status(201).json(run);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not process payroll.' });
  }
});

app.get('/api/reports/admissions', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal']), (req, res) => {
  const { from, to } = reportDateRange(req.query);
  const registrations = readDb().registrations.filter((item) => inDateRange(item.submittedAt || item.createdAt, from, to));
  res.json({
    from,
    to,
    total: registrations.length,
    pending: registrations.filter((item) => item.status === 'pending').length,
    approved: registrations.filter((item) => item.status === 'approved').length,
    rejected: registrations.filter((item) => item.status === 'rejected').length,
    unpaid: registrations.filter((item) => item.financial?.paymentStatus === 'Unpaid').length,
    rows: registrations
  });
});

app.get('/api/reports/finance', requireAuth, requireRole(['Finance', 'Principal']), (req, res) => {
  const { from, to } = reportDateRange(req.query);
  const db = readDb();
  const payments = db.financePayments.filter((item) => inDateRange(item.paidAt || item.createdAt, from, to));
  const expenses = db.financeExpenses.filter((item) => inDateRange(item.date || item.createdAt, from, to));
  const collected = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const spent = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const outstanding = db.financeAccounts.reduce((sum, item) => sum + Number(item.remaining || 0), 0);
  res.json({ from, to, collected: money(collected), expenseTotal: money(spent), net: money(collected - spent), outstanding, payments, expenses });
});

app.get('/api/reports/outstanding', requireAuth, requireRole(['Finance', 'Principal']), (_req, res) => {
  const accounts = readDb().financeAccounts.filter((item) => Number(item.remaining || 0) > 0);
  res.json({ totalOutstanding: money(accounts.reduce((sum, item) => sum + Number(item.remaining || 0), 0)), accounts });
});

app.get('/api/reports/daily-payments', requireAuth, requireRole(['Finance', 'Principal']), (req, res) => {
  const day = String(req.query.date || new Date().toISOString().slice(0, 10));
  const payments = readDb().financePayments.filter((item) => String(item.paidAt || item.createdAt).slice(0, 10) === day);
  res.json({ date: day, total: money(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)), payments });
});

app.get('/api/reports/monthly-payments', requireAuth, requireRole(['Finance', 'Principal']), (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const payments = readDb().financePayments.filter((item) => String(item.paidAt || item.createdAt).slice(0, 7) === month);
  res.json({ month, total: money(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)), payments });
});

app.get('/api/settings', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal', 'Finance']), (_req, res) => {
  res.json(readDb().settings);
});

app.put('/api/settings', requireAuth, requireRole(['Super Admin']), (req, res) => {
  const body = z.record(z.unknown()).safeParse(req.body || {});
  if (!body.success) {
    res.status(400).json({ message: 'Invalid settings payload.', errors: body.error.flatten() });
    return;
  }
  updateDb((db) => {
    db.settings = body.data || {};
  });
  logAudit({ actorId: (req as AuthRequest).user?.id, actorRole: (req as AuthRequest).user?.role, action: 'change settings', entityType: 'settings', entityId: 'settings' });
  res.json(readDb().settings);
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const safeMessage = safeErrorMessage(error);
  const status = safeMessage === 'Unsupported file type.' ? 400 : 500;
  logAudit({
    actorId: (req as AuthRequest).user?.id,
    actorRole: (req as AuthRequest).user?.role,
    action: 'request failed',
    entityType: 'api',
    entityId: req.path,
    details: { success: false, requestId: requestId(req), reason: safeMessage }
  });
  res.status(status).json({
    success: false,
    errorCode: status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
    safeMessage,
    requestId: requestId(req)
  });
});

app.listen(port, () => {
  console.log(`Rawafed backend listening on http://127.0.0.1:${port}`);
});

function standardizeApiResponses(req: Request, res: Response, next: NextFunction): void {
  const id = `REQ-${randomUUID()}`;
  (req as any).requestId = id;
  res.setHeader('X-Request-Id', id);

  const originalJson = res.json.bind(res);
  res.json = (body?: any) => {
    if (res.statusCode >= 400 && !body?.success) {
      return originalJson({
        success: false,
        errorCode: body?.errorCode || statusToErrorCode(res.statusCode),
        safeMessage: safeErrorMessage(body?.safeMessage || body?.message || body),
        fieldErrors: body?.fieldErrors || body?.errors?.fieldErrors || undefined,
        requestId: id,
        details: body?.details
      });
    }
    return originalJson(body);
  };
  next();
}

function requestId(req: Request): string {
  return String((req as any).requestId || req.header('x-request-id') || `REQ-${randomUUID()}`);
}

function statusToErrorCode(status: number): string {
  const map: Record<number, string> = {
    400: 'VALIDATION_ERROR',
    401: 'SESSION_EXPIRED',
    403: 'PERMISSION_DENIED',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'BUSINESS_RULE_FAILED',
    429: 'RATE_LIMITED',
    500: 'SERVER_ERROR',
    503: 'SERVICE_UNAVAILABLE'
  };
  return map[status] || 'REQUEST_FAILED';
}

function safeErrorMessage(error: unknown): string {
  const raw = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';
  const message = raw.trim();
  if (!message) return 'The server could not complete the request. Please try again.';
  if (/sql|sqlite|stack|\/opt\/|\/users\/|token|secret|password hash/i.test(message)) {
    return 'The server could not complete the request. Please try again.';
  }
  return message;
}

function safeUser(user: any): any {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function createStudentFromRegistrationRecord(db: ReturnType<typeof readDb>, registration: any): any {
  const existing = db.students.find((item) => item.registrationId === registration.id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const primaryParent = registration.father?.fullName ? registration.father : registration.mother || registration.father || {};
  const student = {
    id: randomUUID(),
    registrationId: registration.id,
    registrationNumber: registration.registrationNumber,
    englishName: registration.student?.englishName || registration.student?.arabicName || 'Student',
    arabicName: registration.student?.arabicName || undefined,
    grade: registration.student?.applyingGrade || '',
    nationalId: registration.student?.nationalId || undefined,
    passportNumber: registration.student?.passportNumber || undefined,
    parentName: primaryParent.fullName || undefined,
    parentPhone: primaryParent.phone || undefined,
    parentEmail: primaryParent.email || undefined,
    status: 'active' as const,
    profile: registration,
    createdAt: now,
    updatedAt: now
  };

  db.students.unshift(student);
  db.notifications.unshift({
    id: randomUUID(),
    message: `Student created from approved application: ${student.englishName}`,
    targetRoles: ['Admissions', 'Registrar', 'Principal', 'Super Admin'],
    category: 'registration',
    createdAt: now,
    readBy: [],
    link: '/students',
    sourceId: `student-created:${student.id}`
  });
  db.auditLogs.unshift({
    id: randomUUID(),
    action: 'create student',
    entityType: 'student',
    entityId: student.id,
    details: { registrationId: registration.id },
    createdAt: now
  });
  return student;
}

function syncRegistrationPaymentStatus(db: ReturnType<typeof readDb>, account: any): void {
  const paymentStatus = account.status === 'paid' ? 'Paid' : account.status === 'partial' ? 'Partial' : 'Unpaid';
  const now = new Date().toISOString();

  db.registrations = db.registrations.map((registration) => {
    const matchesAccount = registration.id === account.registrationId ||
      (!account.registrationId && registration.registrationNumber === account.registrationNumber);
    if (!matchesAccount) return registration;

    return {
      ...registration,
      financial: {
        ...registration.financial,
        paymentStatus
      },
      updatedAt: now
    };
  });

  db.students = db.students.map((student) => {
    const matchesAccount = student.registrationId === account.registrationId ||
      (!account.registrationId && student.registrationNumber === account.registrationNumber);
    if (!matchesAccount) return student;

    const profile = typeof student.profile === 'object' && student.profile ? student.profile : {};
    const financial = typeof (profile as any).financial === 'object' && (profile as any).financial ? (profile as any).financial : {};

    return {
      ...student,
      profile: {
        ...profile,
        financial: {
          ...financial,
          paymentStatus
        },
        updatedAt: now
      },
      updatedAt: now
    };
  });
}

function withFinancePaymentStatuses(registrations: any[], financeAccounts: any[]): any[] {
  return registrations.map((registration) => {
    const account = financeAccounts.find((item) => item.registrationId === registration.id ||
      (!item.registrationId && item.registrationNumber === registration.registrationNumber));
    if (!account) return registration;

    return {
      ...registration,
      financial: {
        ...registration.financial,
        paymentStatus: paymentStatusFromAccount(account)
      }
    };
  });
}

function withStudentFinancePaymentStatuses(students: any[], financeAccounts: any[]): any[] {
  return students.map((student) => {
    const account = financeAccounts.find((item) => item.registrationId === student.registrationId ||
      (!item.registrationId && item.registrationNumber === student.registrationNumber));
    if (!account) return student;

    const profile = typeof student.profile === 'object' && student.profile ? student.profile : {};
    const financial = typeof profile.financial === 'object' && profile.financial ? profile.financial : {};

    return {
      ...student,
      profile: {
        ...profile,
        financial: {
          ...financial,
          paymentStatus: paymentStatusFromAccount(account)
        }
      }
    };
  });
}

function paymentStatusFromAccount(account: any): 'Paid' | 'Partial' | 'Unpaid' {
  if (account.status === 'paid' || account.status === 'Paid') return 'Paid';
  if (account.status === 'partial' || account.status === 'Partial') return 'Partial';
  return 'Unpaid';
}

function withVatRulesOnAccounts(accounts: any[], registrations: any[]): any[] {
  return accounts.map((account) => {
    const registration = registrations.find((item) => item.id === account.registrationId ||
      (!account.registrationId && item.registrationNumber === account.registrationNumber));
    return applyVatRulesToAccount({ ...account }, registration);
  });
}

function applyVatRulesToAccount(account: any, registration: any): any {
  if (!isVatExemptRegistration(registration)) return account;

  const expectedTotal = account.feeItems?.length
    ? money(account.feeItems.reduce((sum: number, item: any) => sum + money(item.amount), 0))
    : money(registrationSubtotal(registration) || account.expectedTotal);
  const paid = money(account.paid);

  account.expectedTotal = expectedTotal;
  account.remaining = money(Math.max(expectedTotal - paid, 0));
  account.status = account.remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  account.vatExempt = true;
  return account;
}

function withVatRulesOnInvoices(invoices: any[], registrations: any[]): any[] {
  return invoices.map((invoice) => {
    const registration = registrations.find((item) => item.id === invoice.registrationId ||
      (!invoice.registrationId && item.registrationNumber === invoice.registrationNumber));
    if (!isVatExemptRegistration(registration)) return invoice;

    const total = money(invoice.total || invoice.paid || invoice.amountBeforeVat);
    return {
      ...invoice,
      amountBeforeVat: total,
      vat: 0,
      total,
      vatExempt: true
    };
  });
}

function registrationForAccount(db: ReturnType<typeof readDb>, account: any): any {
  return db.registrations.find((item) => item.id === account.registrationId ||
    (!account.registrationId && item.registrationNumber === account.registrationNumber));
}

function registrationSubtotal(registration: any): number {
  const financial = registration?.financial || {};
  return money(
    money(financial.registrationFee) +
    money(financial.tuition) +
    money(financial.books) +
    money(financial.uniform) +
    money(financial.activities) +
    (financial.transportationRequired ? money(financial.transportationFee) : 0)
  );
}

function reportDateRange(query: Record<string, unknown>): { from?: string; to?: string } {
  return {
    from: typeof query.from === 'string' ? query.from : undefined,
    to: typeof query.to === 'string' ? query.to : undefined
  };
}

function inDateRange(value: string | undefined, from?: string, to?: string): boolean {
  if (!value) return false;
  const date = value.slice(0, 10);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function safeJsonParse<T>(value: string | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function nextRegistrationNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `RAW-${year}-`;
  const db = readDb();
  const highest = db.registrations
    .map((item) => String(item.registrationNumber || ''))
    .filter((value) => value.startsWith(prefix))
    .map((value) => Number(value.slice(prefix.length)))
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 124);
  return `${prefix}${String(highest + 1).padStart(6, '0')}`;
}

function persistRegistration(registration: z.infer<typeof registrationSchema>): any {
  const now = new Date().toISOString();
  const submitted = {
    ...registration,
    id: registration.id || randomUUID(),
    registrationNumber: registration.registrationNumber || nextRegistrationNumber(),
    status: registration.status || 'pending',
    submittedAt: registration.submittedAt || now,
    createdAt: registration.createdAt || now,
    updatedAt: now
  };

  updateDb((db) => {
    db.registrations = [submitted, ...db.registrations.filter((item) => item.id !== submitted.id)];
    db.notifications.unshift({
      id: randomUUID(),
      message: `New application waiting approval: ${submitted.student?.englishName || submitted.registrationNumber}`,
      targetRoles: ['Admissions', 'Registrar', 'Principal', 'Super Admin'],
      category: 'registration',
      createdAt: now,
      readBy: [],
      link: '/applications',
      sourceId: `registration-approval:${submitted.id}`
    });
    ensureFinanceAccount(db, submitted);
  });

  return submitted;
}
