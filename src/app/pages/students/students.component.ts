import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { FinancePackage } from '../../core/finance/finance.models';
import { FinanceStorageService } from '../../core/finance/finance-storage.service';
import { FeedbackService, safeErrorMessage } from '../../core/feedback/feedback.service';

interface StudentRow {
  id: string;
  registrationId?: string;
  registrationNumber?: string;
  englishName: string;
  arabicName?: string;
  grade: string;
  nationalId?: string;
  passportNumber?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  status: string;
  profile?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface DeleteEligibility {
  studentId: string;
  registrationNumber?: string;
  displayName: string;
  status: string;
  eligible: boolean;
  counts: Record<string, number>;
  reasons: string[];
}

@Component({
  selector: 'raw-students',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink],
  templateUrl: './students.component.html',
  styleUrls: ['./students.component.scss']
})
export class StudentsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly finance = inject(FinanceStorageService);
  private readonly feedback = inject(FeedbackService);
  readonly auth = inject(AuthService);

  readonly students = signal<StudentRow[]>([]);
  readonly financeAccounts = signal<FinancePackage[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  search = '';
  includeArchived = false;
  editStudent: StudentRow | null = null;
  editForm: Record<string, any> = {};
  actionDialog: { student: StudentRow; action: 'archive' | 'restore'; reason: string } | null = null;
  deletion: DeleteEligibility | null = null;
  deletionStudent: StudentRow | null = null;
  deletionReason = '';
  deletionConfirmation = '';
  auditStudent: StudentRow | null = null;
  auditRows: any[] = [];

  readonly visibleStudents = computed(() => {
    const query = this.search.trim().toLowerCase();
    return this.students().filter((student) => {
      if (!this.includeArchived && student.status === 'archived') return false;
      if (!query) return true;
      return [student.englishName, student.arabicName, student.registrationNumber, student.nationalId, student.grade]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  });

  async ngOnInit(): Promise<void> { await this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [students, accounts] = await Promise.all([
        this.api.get<StudentRow[]>('/students?includeArchived=true'),
        new Promise<FinancePackage[]>((resolve, reject) => this.finance.getPackages().subscribe({ next: resolve, error: reject })),
      ]);
      this.students.set(students);
      this.financeAccounts.set(accounts);
    } catch (error) {
      this.feedback.error('تعذر تحميل الطلاب', safeErrorMessage(error));
    } finally { this.loading.set(false); }
  }

  initials(student: StudentRow): string {
    return (student.englishName || student.arabicName || 'RS').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  accountFor(student: StudentRow): FinancePackage | undefined {
    return this.financeAccounts().find((account) => account.studentId === student.id);
  }

  deletionCountLabel(key: string): string {
    return ({
      invoices: 'الفواتير', payments: 'دفعات الطالب', receipts: 'الإيصالات', journals: 'القيود المحاسبية',
      customerPayments: 'دفعات العملاء', receivableJournalLines: 'حركات حساب الطالب', inventoryMovements: 'حركات المخزون',
      documents: 'المستندات', directCosts: 'التكاليف المباشرة', installments: 'الأقساط',
    } as Record<string, string>)[key] || key;
  }

  beginEdit(student: StudentRow): void {
    const profile = (student.profile?.['student'] || student.profile || {}) as Record<string, any>;
    this.editStudent = student;
    this.editForm = {
      englishName: student.englishName || '', arabicName: student.arabicName || '', grade: student.grade || '',
      nationalId: student.nationalId || '', identityType: profile['identityType'] || 'NATIONAL_ID', nationality: profile['nationality'] || '',
      passportNumber: student.passportNumber || '', parentName: student.parentName || '', parentPhone: student.parentPhone || '',
      parentEmail: student.parentEmail || '', className: profile['className'] || '', academicYear: profile['academicYear'] || '',
      gender: profile['gender'] || '', dateOfBirth: profile['dateOfBirth'] || '', notes: profile['notes'] || '', reason: '',
    };
  }

  closeEdit(): void { if (!this.saving()) this.editStudent = null; }

  async saveEdit(): Promise<void> {
    if (!this.editStudent || this.saving()) return;
    const student = this.editStudent;
    const profile = (student.profile?.['student'] || student.profile || {}) as Record<string, any>;
    const current: Record<string, any> = {
      englishName: student.englishName || '', arabicName: student.arabicName || '', grade: student.grade || '',
      nationalId: student.nationalId || '', identityType: profile['identityType'] || 'NATIONAL_ID', nationality: profile['nationality'] || '',
      passportNumber: student.passportNumber || '', parentName: student.parentName || '', parentPhone: student.parentPhone || '',
      parentEmail: student.parentEmail || '', className: profile['className'] || '', academicYear: profile['academicYear'] || '',
      gender: profile['gender'] || '', dateOfBirth: profile['dateOfBirth'] || '', notes: profile['notes'] || '',
    };
    const payload: Record<string, any> = {};
    for (const key of Object.keys(current)) if (String(this.editForm[key] ?? '') !== String(current[key] ?? '')) payload[key] = this.editForm[key];
    if (!Object.keys(payload).length) { this.feedback.info('لا توجد تعديلات للحفظ'); return; }
    const sensitive = ['nationalId', 'identityType', 'nationality', 'grade', 'academicYear'].some((key) => key in payload);
    if (sensitive && !String(this.editForm['reason'] || '').trim()) {
      this.feedback.validation('يجب كتابة سبب عند تعديل الهوية أو الجنسية أو الصف أو العام الدراسي.');
      return;
    }
    if (this.editForm['reason']) payload['reason'] = this.editForm['reason'];
    this.saving.set(true);
    try {
      const updated = await this.api.patch<StudentRow & { warnings?: string[] }>(`/students/${student.id}`, payload);
      this.students.update((rows) => rows.map((row) => row.id === student.id ? updated : row));
      this.editStudent = null;
      this.feedback.success('تم تعديل بيانات الطالب', updated.warnings?.join(' ') || 'تم حفظ القيم الجديدة في PostgreSQL وتسجيل التعديل في سجل المراجعة.');
    } catch (error) { this.feedback.error('لم يتم تعديل الطالب', safeErrorMessage(error)); }
    finally { this.saving.set(false); }
  }

  beginStatusAction(student: StudentRow, action: 'archive' | 'restore'): void {
    this.actionDialog = { student, action, reason: '' };
  }

  async submitStatusAction(): Promise<void> {
    if (!this.actionDialog || this.saving()) return;
    if (this.actionDialog.reason.trim().length < 3) { this.feedback.validation('اكتب سببًا واضحًا لا يقل عن 3 أحرف.'); return; }
    const { student, action, reason } = this.actionDialog;
    this.saving.set(true);
    try {
      const updated = await this.api.patch<StudentRow>(`/students/${student.id}/${action}`, { reason });
      this.students.update((rows) => rows.map((row) => row.id === student.id ? updated : row));
      this.actionDialog = null;
      this.feedback.success(action === 'archive' ? 'تمت أرشفة الطالب' : 'تمت استعادة الطالب');
    } catch (error) { this.feedback.error('تعذر تنفيذ الإجراء', safeErrorMessage(error)); }
    finally { this.saving.set(false); }
  }

  async reviewDeletion(student: StudentRow): Promise<void> {
    this.saving.set(true);
    try {
      this.deletion = await this.api.get<DeleteEligibility>(`/students/${student.id}/deletion-eligibility`);
      this.deletionStudent = student; this.deletionReason = ''; this.deletionConfirmation = '';
    } catch (error) { this.feedback.error('تعذر فحص الحذف', safeErrorMessage(error)); }
    finally { this.saving.set(false); }
  }

  closeDeletion(): void { if (!this.saving()) { this.deletion = null; this.deletionStudent = null; } }

  archiveFromDeletion(): void {
    if (!this.deletionStudent || this.saving()) return;
    const student = this.deletionStudent;
    this.closeDeletion();
    this.beginStatusAction(student, 'archive');
  }

  async permanentlyDelete(): Promise<void> {
    if (!this.deletion?.eligible || !this.deletionStudent || this.saving()) return;
    if (this.deletionReason.trim().length < 3) { this.feedback.validation('سبب الحذف مطلوب.'); return; }
    if (![this.deletion.registrationNumber, this.deletion.displayName].filter(Boolean).includes(this.deletionConfirmation.trim())) {
      this.feedback.validation('اكتب رقم التسجيل أو اسم الطالب كما هو ظاهر للتأكيد.'); return;
    }
    this.saving.set(true);
    try {
      await this.api.delete(`/students/${this.deletionStudent.id}/permanent`, { reason: this.deletionReason, confirmation: this.deletionConfirmation.trim() });
      this.students.update((rows) => rows.filter((row) => row.id !== this.deletionStudent!.id));
      this.deletion = null; this.deletionStudent = null;
      this.feedback.success('تم حذف الطالب نهائيًا', 'تم حذف السجل والعلاقات الفارغة من PostgreSQL مع الاحتفاظ بسجل حذف مختصر للمراجعة.');
    } catch (error) { this.feedback.error('لم يتم حذف الطالب', safeErrorMessage(error)); }
    finally { this.saving.set(false); }
  }

  async viewAudit(student: StudentRow): Promise<void> {
    this.saving.set(true);
    try { this.auditRows = await this.api.get<any[]>(`/students/${student.id}/audit`); this.auditStudent = student; }
    catch (error) { this.feedback.error('تعذر تحميل سجل التعديلات', safeErrorMessage(error)); }
    finally { this.saving.set(false); }
  }
}
