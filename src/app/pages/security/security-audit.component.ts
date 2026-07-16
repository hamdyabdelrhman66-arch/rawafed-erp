import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { FeedbackService, safeErrorMessage } from '../../core/feedback/feedback.service';

type SecurityTab = 'overview' | 'audit' | 'sessions' | 'attempts' | 'permissions' | 'alerts' | 'settings' | 'devices' | 'exports';

@Component({
  selector: 'app-security-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './security-audit.component.html',
  styleUrl: './security-audit.component.scss',
})
export class SecurityAuditComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private readonly api = inject(ApiService);
  private readonly feedback = inject(FeedbackService);
  tab: SecurityTab = 'overview';
  loading = false;
  error = '';
  overview: any = { cards: {}, charts: {} };
  audits: any[] = [];
  totalAudits = 0;
  sessions: any[] = [];
  attempts: any[] = [];
  alerts: any[] = [];
  permissions: any = { permissions: [], roles: [] };
  settings: any = {};
  devices: any[] = [];
  exports: any[] = [];
  selected: any = null;
  search = '';
  riskLevel = '';

  readonly tabs: Array<{ id: SecurityTab; en: string; ar: string }> = [
    { id: 'overview', en: 'Security Overview', ar: 'حالة النظام الأمنية' },
    { id: 'audit', en: 'Audit Log', ar: 'سجل النشاط' },
    { id: 'sessions', en: 'User Sessions', ar: 'جلسات المستخدمين' },
    { id: 'attempts', en: 'Login Attempts', ar: 'محاولات تسجيل الدخول' },
    { id: 'permissions', en: 'Users & Permissions', ar: 'المستخدمون والصلاحيات' },
    { id: 'alerts', en: 'Security Alerts', ar: 'تنبيهات الأمان' },
    { id: 'settings', en: 'Security Settings', ar: 'إعدادات الأمان' },
    { id: 'devices', en: 'Trusted Devices', ar: 'الأجهزة الموثوقة' },
    { id: 'exports', en: 'Data Export Log', ar: 'سجل تصدير البيانات' },
  ];

  ngOnInit(): void { void this.load(); }
  label(en: string, ar: string): string { return this.i18n.label(en, ar); }
  async selectTab(tab: SecurityTab): Promise<void> { this.tab = tab; this.selected = null; await this.load(); }

  async load(): Promise<void> {
    this.loading = true; this.error = '';
    try {
      if (this.tab === 'overview') this.overview = await this.api.get<any>('/security/overview');
      if (this.tab === 'audit') {
        const params = new URLSearchParams();
        if (this.search) params.set('search', this.search);
        if (this.riskLevel) params.set('riskLevel', this.riskLevel);
        const result = await this.api.get<any>(`/security/audit?${params}`);
        this.audits = result.rows; this.totalAudits = result.total;
      }
      if (this.tab === 'sessions') this.sessions = await this.api.get<any[]>('/security/sessions');
      if (this.tab === 'attempts') this.attempts = await this.api.get<any[]>('/security/login-attempts');
      if (this.tab === 'permissions') this.permissions = await this.api.get<any>('/security/permissions');
      if (this.tab === 'alerts') this.alerts = await this.api.get<any[]>('/security/alerts');
      if (this.tab === 'settings') this.settings = await this.api.get<any>('/security/settings');
      if (this.tab === 'devices') this.devices = await this.api.get<any[]>('/security/trusted-devices');
      if (this.tab === 'exports') this.exports = await this.api.get<any[]>('/security/exports');
    } catch (error) { this.error = safeErrorMessage(error); }
    finally { this.loading = false; }
  }

  async openAudit(row: any): Promise<void> {
    try { this.selected = await this.api.get<any>(`/security/audit/${row.id}`); }
    catch (error) { this.feedback.error(this.label('Could not open audit record.', 'تعذر فتح سجل النشاط.'), safeErrorMessage(error)); }
  }
  async revoke(session: any): Promise<void> {
    try { await this.api.post(`/security/sessions/${session.id}/revoke`, { reason: 'Revoked by security administrator' }); await this.load(); this.feedback.success(this.label('Session revoked.', 'تم إلغاء الجلسة.')); }
    catch (error) { this.feedback.error(this.label('Could not revoke session.', 'تعذر إلغاء الجلسة.'), safeErrorMessage(error)); }
  }
  async resolve(alert: any): Promise<void> {
    await this.api.patch(`/security/alerts/${alert.id}`, { status: 'RESOLVED', resolutionNotes: this.label('Reviewed by administrator', 'تمت المراجعة بواسطة المسؤول') });
    await this.load();
  }
  async saveSettings(): Promise<void> {
    const allowed = ['maxFailedAttempts', 'failureWindowMinutes', 'lockDurationMinutes', 'idleTimeoutMinutes', 'absoluteTimeoutHours', 'maxConcurrentSessions', 'minimumPasswordLength', 'passwordHistoryCount', 'requireMfaPrivileged', 'segregationOfDuties', 'auditRetentionDays'];
    const payload = Object.fromEntries(allowed.filter((key) => this.settings[key] !== undefined).map((key) => [key, this.settings[key]]));
    try { await this.api.put('/security/settings', payload); this.feedback.success(this.label('Security settings saved.', 'تم حفظ إعدادات الأمان.')); }
    catch (error) { this.feedback.error(this.label('Could not save settings.', 'تعذر حفظ الإعدادات.'), safeErrorMessage(error)); }
  }
  keys(value: any): string[] { return value ? Object.keys(value) : []; }
}
