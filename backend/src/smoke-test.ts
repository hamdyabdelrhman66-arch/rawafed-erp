import { spawn } from 'node:child_process';

const baseUrl = 'http://127.0.0.1:4300/api';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const server = spawn(npmCommand, ['run', 'dev'], {
  cwd: process.cwd(),
  stdio: 'ignore',
  shell: false
});

try {
  await waitForHealth();
  const login = await request('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' }
  });
  assert(login.token, 'login should return access token');
  assert(login.refreshToken, 'login should return refresh token');
  const auth = login.token as string;

  const registration = await request('/registrations', {
    method: 'POST',
    token: auth,
    body: {
      student: {
        englishName: `Smoke Student ${Date.now()}`,
        arabicName: 'طالب اختبار',
        applyingGrade: 'KG1',
        nationalId: `SMK${Date.now()}`
      },
      father: {
        fullName: 'Smoke Parent',
        phone: '0500000000',
        email: 'smoke@example.com'
      },
      financial: {
        registrationFee: 1000,
        tuition: 9000,
        books: 500,
        uniform: 400,
        activities: 300,
        transportationRequired: false,
        vat: 15,
        grandTotal: 11200,
        paymentStatus: 'Unpaid'
      }
    }
  });
  assert(registration.id, 'registration should be created');

  const approved = await request(`/registrations/${registration.id}/status`, {
    method: 'PATCH',
    token: auth,
    body: { status: 'approved' }
  });
  assert(approved.status === 'approved', 'registration should be approved');

  const students = await request('/students', { token: auth });
  assert(students.some((student: any) => student.registrationId === registration.id), 'student should be created from approval');

  const accounts = await request('/finance/accounts', { token: auth });
  const account = accounts.find((item: any) => item.registrationId === registration.id);
  assert(account, 'finance account should be created');

  const paymentResult = await request('/finance/payments', {
    method: 'POST',
    token: auth,
    body: {
      accountId: account.id,
      paymentItem: 'Smoke Tuition',
      amount: 1000,
      method: 'Cash'
    }
  });
  assert(paymentResult.payment?.id, 'payment should be created');
  assert(paymentResult.invoice?.id, 'invoice should be generated with payment');

  const exported = await request('/admin/export', { token: auth });
  assert(Array.isArray(exported.registrations), 'export should return database shape');

  console.log('Smoke tests passed.');
} finally {
  server.kill();
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const health = await request('/health');
      if (health.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('Backend did not start in time.');
}

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return undefined;
  return response.json();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
