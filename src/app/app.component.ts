import { CommonModule } from "@angular/common";
import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
  ViewChild,
} from "@angular/core";
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { filter } from "rxjs";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatBadgeModule } from "@angular/material/badge";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { UserRole } from "./core/auth/auth.models";
import { AuthService } from "./core/auth/auth.service";
import { I18nService } from "./core/i18n/i18n.service";
import { TranslatePipe } from "./core/i18n/translate.pipe";
import { StorageService } from "./core/services/storage.service";
import { ConfirmDialogComponent } from "./core/feedback/confirm-dialog.component";
import { ToastHostComponent } from "./core/feedback/toast-host.component";

@Component({
  selector: "raw-root",
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatSlideToggleModule,
    TranslatePipe,
    ToastHostComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent {
  @ViewChild("notificationCenter") notificationCenter?: ElementRef<HTMLElement>;
  @ViewChild("notificationButton")
  notificationButton?: ElementRef<HTMLButtonElement>;
  public readonly i18n = inject(I18nService);
  readonly direction = this.i18n.direction;
  readonly darkMode = signal(false);
  readonly sidebarCollapsed = signal(false);
  readonly currentUrl = signal("");
  readonly notificationsOpen = signal(false);
  readonly shellHidden = computed(() =>
    ["/login", "/register"].includes(this.currentUrl().split("?")[0]),
  );
  readonly visibleNotifications = computed(() =>
    this.storage.notificationsFor(this.auth.session()?.role),
  );
  readonly unreadNotifications = computed(() =>
    this.storage.unreadNotificationsFor(
      this.auth.session()?.role,
      this.auth.session()?.id || this.auth.session()?.username,
    ),
  );
  readonly currentDate = computed(() =>
    new Intl.DateTimeFormat(this.i18n.language() === "ar" ? "ar-SA" : "en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date()),
  );

  constructor(
    public readonly storage: StorageService,
    public readonly auth: AuthService,
    private readonly router: Router,
  ) {
    this.currentUrl.set(this.router.url);
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
        this.closeNotifications();
        this.syncProtectedData();
        this.localizePageAfterRender();
      });
    this.localizePageAfterRender();
  }

  canAccess(roles?: UserRole[]): boolean {
    return this.auth.canAccess(roles);
  }

  logout(): void {
    this.closeNotifications();
    this.auth.logout();
  }

  toggleDirection(): void {
    this.closeNotifications();
    this.i18n.toggleLanguage();
    this.localizePageAfterRender();
  }

  toggleDarkMode(): void {
    this.darkMode.set(!this.darkMode());
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.set(!this.sidebarCollapsed());
  }

  isActive(path: string): boolean {
    const current = this.currentUrl().split("?")[0];
    return current === path || current.startsWith(`${path}/`);
  }

  isQueryTabActive(path: string, tab: string): boolean {
    const url = new URL(this.currentUrl(), "http://rawafed.local");
    const defaultTab = path.includes("inventory") ? "dashboard" : "overview";
    return (
      url.pathname === path &&
      (url.searchParams.get("tab") || defaultTab) === tab
    );
  }

  isQueryParamActive(
    path: string,
    param: string,
    value: string,
    defaultValue: string,
  ): boolean {
    const url = new URL(this.currentUrl(), "http://rawafed.local");
    return (
      url.pathname === path &&
      (url.searchParams.get(param) || defaultValue) === value
    );
  }

  toggleNotifications(): void {
    const next = !this.notificationsOpen();
    this.notificationsOpen.set(next);
  }

  async openNotification(note: { id: string }): Promise<void> {
    await this.storage.markNotificationRead(
      note.id,
      this.auth.session()?.role,
      this.auth.session()?.id || this.auth.session()?.username,
    );
    this.closeNotifications();
  }

  closeNotifications(returnFocus = false): void {
    if (!this.notificationsOpen()) return;
    this.notificationsOpen.set(false);
    if (returnFocus) this.notificationButton?.nativeElement.focus();
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    if (!this.notificationsOpen()) return;
    const target = event.target as Node | null;
    if (target && !this.notificationCenter?.nativeElement.contains(target))
      this.closeNotifications();
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeNotifications(true);
  }

  private syncProtectedData(): void {
    const session = this.auth.session();
    if (this.shellHidden() || !session) return;
    void this.storage
      .syncFromApi(session.role)
      .catch((error) => console.error("Protected data sync failed", error));
  }

  private localizePageAfterRender(): void {
    setTimeout(() => this.i18n.localizeStaticContent());
    setTimeout(() => this.i18n.localizeStaticContent(), 250);
  }
}
