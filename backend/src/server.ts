import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AuthRequest, createOpaqueToken, hashToken, requireAuth, requireRole, signRefreshToken, signUser, verifyRefreshToken } from './auth.js';
import { logAudit, readDb, updateDb } from './db.js';
import { applyPaymentToAccount, ensureFinanceAccount, money } from './finance.js';

const app = express();
const port = Number(process.env.PORT || 4300);
const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadDir = join(__dirname, '..', 'uploads');
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
  res.json({ ok: true, service: 'rawafed-backend', time: new Date().toISOString() });
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

const roleSchema = z.enum(['Super Admin', 'Admissions', 'Finance', 'Principal', 'Registrar']);
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
  position: z.string().min(1),
  department: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  salary: z.coerce.number().nonnegative().default(0),
  startDate: z.string().optional(),
  nationality: z.string().optional(),
  idNumber: z.string().optional(),
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
  res.json(readDb().registrations);
});

app.post('/api/registrations', requireAuth, requireRole(['Admissions', 'Registrar']), (req: AuthRequest, res) => {
  const body = registrationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid registration payload.', errors: body.error.flatten() });
    return;
  }

  const now = new Date().toISOString();
  const submitted = {
    ...body.data,
    id: body.data.id || randomUUID(),
    registrationNumber: body.data.registrationNumber || nextRegistrationNumber(),
    status: body.data.status || 'pending',
    submittedAt: body.data.submittedAt || now,
    createdAt: body.data.createdAt || now,
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
    logAudit({ actorId: (req as AuthRequest).user?.id, actorRole: (req as AuthRequest).user?.role, action: 'approve application', entityType: 'registration', entityId: updated.id });
  }
  res.json(updated);
});

app.get('/api/students', requireAuth, requireRole(['Admissions', 'Registrar', 'Principal', 'Finance']), (_req, res) => {
  res.json(readDb().students);
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

app.get('/api/finance/accounts', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(readDb().financeAccounts);
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

    applyPaymentToAccount(account, body.data.amount);
    const vat = money(body.data.amount - body.data.amount / 1.15);
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
  res.status(201).json(created);
});

app.get('/api/finance/invoices', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(readDb().financeInvoices);
});

app.get('/api/finance/expenses', requireAuth, requireRole(['Finance']), (_req, res) => {
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
  const invoice = {
    id: String(body.data.id || randomUUID()),
    accountId: body.data.accountId ? String(body.data.accountId) : undefined,
    registrationId: body.data.registrationId,
    registrationNumber: body.data.registrationNumber,
    invoiceNumber: String(body.data.invoiceNumber || `INV-${Date.now()}`),
    studentName: String(body.data.patient || body.data.studentName || ''),
    feeItem: String(body.data.feeItem || body.data.service || 'School Fees'),
    amountBeforeVat: money(body.data.amountBeforeVat ?? body.data.amount),
    vat: money(body.data.vat),
    total: money(body.data.total ?? body.data.amount),
    paid: money(body.data.paid),
    remaining: money(body.data.remaining),
    paymentMethod: String(body.data.paymentMethod || 'Cash'),
    status: body.data.status === 'Paid' ? 'Paid' as const : 'Pending' as const,
    issuedAt: String(body.data.date || now),
    createdAt: now
  };
  updateDb((db) => db.financeInvoices.unshift(invoice));
  logAudit({ actorId: (req as AuthRequest).user?.id, actorRole: (req as AuthRequest).user?.role, action: 'create invoice', entityType: 'finance_invoice', entityId: invoice.id });
  res.status(201).json(invoice);
});

app.post('/api/finance/expenses', requireAuth, requireRole(['Finance']), (req, res) => {
  const body = z.object({
    category: z.string().min(1).default('General'),
    title: z.string().min(1).default('Expense'),
    amount: z.coerce.number().nonnegative(),
    date: z.string().optional(),
    status: z.string().min(1).default('Pending'),
    notes: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid expense payload.', errors: body.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  const expense = {
    id: randomUUID(),
    category: body.data.category,
    title: body.data.title,
    amount: money(body.data.amount),
    date: String(body.data.date || now.slice(0, 10)),
    status: body.data.status,
    notes: body.data.notes,
    createdAt: now,
    updatedAt: now
  };
  updateDb((db) => db.financeExpenses.unshift(expense));
  res.status(201).json(expense);
});

app.get('/api/staff', requireAuth, requireRole(['Finance']), (_req, res) => {
  res.json(readDb().staff);
});

app.post('/api/staff', requireAuth, requireRole(['Finance']), (req, res) => {
  const body = staffSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: 'Invalid staff payload.', errors: body.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  const staff = {
    id: randomUUID(),
    name: body.data.name,
    position: body.data.position,
    department: body.data.department,
    phone: body.data.phone,
    email: body.data.email,
    salary: money(body.data.salary),
    startDate: body.data.startDate,
    nationality: body.data.nationality,
    idNumber: body.data.idNumber,
    status: body.data.status,
    notes: body.data.notes,
    createdAt: now,
    updatedAt: now
  };
  updateDb((db) => db.staff.unshift(staff));
  res.status(201).json(staff);
});

app.patch('/api/staff/:id', requireAuth, requireRole(['Finance']), (req, res) => {
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

app.delete('/api/staff/:id', requireAuth, requireRole(['Finance']), (req, res) => {
  updateDb((db) => {
    db.staff = db.staff.filter((item) => item.id !== req.params.id);
  });
  res.status(204).send();
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

app.listen(port, () => {
  console.log(`Rawafed backend listening on http://127.0.0.1:${port}`);
});

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
