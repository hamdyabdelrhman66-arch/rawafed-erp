import { DOCUMENT, CommonModule } from '@angular/common';
import { Component, Inject, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { UserRole } from './core/auth/auth.models';
import { AuthService } from './core/auth/auth.service';
import { FinanceStorageService } from './core/finance/finance-storage.service';
import { Direction } from './core/models/admission.models';
import { StorageService } from './core/services/storage.service';

@Component({
  selector: 'raw-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatBadgeModule, MatSlideToggleModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']})
export class AppComponent {
  readonly direction = signal<Direction>('ltr');
  readonly darkMode = signal(false);
  readonly currentUrl = signal('');
  readonly notificationsOpen = signal(false);
  readonly shellHidden = computed(() => ['/login', '/register'].includes(this.currentUrl().split('?')[0]));
  readonly visibleNotifications = computed(() => this.storage.notificationsFor(this.auth.session()?.role));
  readonly unreadNotifications = computed(() => this.storage.unreadNotificationsFor(this.auth.session()?.role));
  readonly currentDate = computed(() => new Intl.DateTimeFormat(this.direction() === 'rtl' ? 'ar-SA' : 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date()));

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    public readonly storage: StorageService,
    public readonly auth: AuthService,
    private readonly finance: FinanceStorageService,
    private readonly router: Router
  ) {
    this.applyDirection('ltr');
    this.currentUrl.set(this.router.url);
    void this.storage.syncFromApi();
    this.syncOperationalNotifications();
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      this.currentUrl.set(event.urlAfterRedirects);
      void this.storage.syncFromApi();
      this.syncOperationalNotifications();
    });
  }

  canAccess(roles?: UserRole[]): boolean {
    return this.auth.canAccess(roles);
  }

  logout(): void {
    this.auth.logout();
  }

  toggleDirection(): void {
    this.applyDirection(this.direction() === 'ltr' ? 'rtl' : 'ltr');
  }

  toggleDarkMode(): void {
    this.darkMode.set(!this.darkMode());
  }

  toggleNotifications(): void {
    const next = !this.notificationsOpen();
    this.notificationsOpen.set(next);
    if (next) this.storage.markNotificationsRead(this.auth.session()?.role);
  }

  private applyDirection(direction: Direction): void {
    this.direction.set(direction);
    this.document.documentElement.dir = direction;
    this.document.documentElement.lang = direction === 'rtl' ? 'ar' : 'en';
  }

  private syncOperationalNotifications(): void {
    this.finance.ensureAccountsFromRegistrations(this.storage.registrations());

    this.storage.registrations()
      .filter((item) => item.status === 'pending')
      .forEach((item) => {
        const studentName = item.student.englishName || item.student.arabicName || item.registrationNumber || 'New student';
        this.storage.ensureNotification(
          `New application waiting approval: ${studentName}`,
          ['Admissions', 'Registrar', 'Principal', 'Super Admin'],
          'registration',
          '/applications',
          `registration-approval:${item.id}`
        );
      });

    this.finance.getPackages().subscribe((accounts: any[]) => {
      accounts
        .filter((account) => account.notificationStatus === 'new' || Number(account.paid || 0) === 0)
        .forEach((account) => {
          this.storage.ensureNotification(
            `New student finance account: ${account.patient}. Expected total: ${Number(account.total || 0).toLocaleString('en-US')} SAR`,
            ['Finance', 'Super Admin'],
            'finance',
            '/finance/patient-packages',
            `finance-account:${account.registrationNumber || account.id}`
          );
          this.storage.ensureNotification(
            `New student needs admission review: ${account.patient}`,
            ['Admissions', 'Registrar', 'Principal', 'Super Admin'],
            'registration',
            '/applications',
            `finance-account-admission:${account.registrationNumber || account.id}`
          );
        });
    });
  }
}
