import { Injectable, computed, signal } from "@angular/core";
import { ApiService } from "../api/api.service";
import { UserRole } from "../auth/auth.models";
import {
  AdmissionRegistration,
  DEFAULT_GRADE_FEES,
  DEFAULT_SETTINGS,
  DEFAULT_TRANSPORTATION_AREAS,
  GRADE_LEVELS,
  GradeFeeSettings,
  SchoolSettings,
  TransportationArea,
} from "../models/admission.models";

const REGISTRATIONS_KEY = "rawafed.registrations";
const DRAFT_KEY = "rawafed.currentDraft";
const SETTINGS_KEY = "rawafed.settings";
const NOTIFICATIONS_KEY = "rawafed.notifications";

export interface AppNotification {
  id: string;
  message: string;
  targetRoles: UserRole[] | "all";
  category: "registration" | "finance" | "admin";
  createdAt: string;
  readBy: string[];
  link?: string;
  sourceId?: string;
}

@Injectable({ providedIn: "root" })
export class StorageService {
  private readonly registrationsState = signal<AdmissionRegistration[]>([]);
  private readonly settingsState = signal<SchoolSettings>(
    this.normalizeSettings(DEFAULT_SETTINGS),
  );
  private readonly notificationsState = signal<AppNotification[]>([]);
  private notificationPoll?: number;

  readonly registrations = this.registrationsState.asReadonly();
  readonly settings = this.settingsState.asReadonly();
  readonly notifications = this.notificationsState.asReadonly();
  readonly pendingCount = computed(
    () =>
      this.registrations().filter((item) => item.status === "pending").length,
  );

  constructor(private readonly api: ApiService) {
    window.addEventListener("storage", (event) => {
      if (event.key === REGISTRATIONS_KEY) {
        this.registrationsState.set(this.read(REGISTRATIONS_KEY, []));
      }

      if (event.key === SETTINGS_KEY) {
        this.settingsState.set(this.readSettings());
      }

      if (event.key === NOTIFICATIONS_KEY) {
        this.notificationsState.set(this.readNotifications());
      }
    });
  }

  async syncFromApi(role?: UserRole): Promise<void> {
    const shouldSyncRegistrations = this.canSyncRegistrations(role);
    await Promise.all([
      shouldSyncRegistrations
        ? this.syncRegistrationsFromApi()
        : Promise.resolve(),
      this.syncNotificationsFromApi(),
      this.syncSettingsFromApi(),
    ]);
    if (role && !this.notificationPoll) {
      this.notificationPoll = window.setInterval(
        () => void this.syncNotificationsFromApi(),
        30_000,
      );
    }
  }

  async syncRegistrationsFromApi(): Promise<void> {
    try {
      const registrations =
        await this.api.get<AdmissionRegistration[]>("/registrations");
      this.registrationsState.set(registrations);
    } catch (error) {
      console.error("Could not sync registrations from backend", error);
      throw error;
    }
  }

  async syncNotificationsFromApi(): Promise<void> {
    try {
      const notifications =
        await this.api.get<AppNotification[]>("/notifications");
      this.notificationsState.set(notifications);
    } catch (error) {
      console.error("Could not sync notifications from backend", error);
    }
  }

  async syncSettingsFromApi(): Promise<void> {
    try {
      const settings = await this.api.get<Partial<SchoolSettings>>("/settings");
      if (settings && Object.keys(settings).length) {
        const normalized = this.normalizeSettings(settings as SchoolSettings);
        this.settingsState.set(normalized);
      }
    } catch (error) {
      console.error("Could not sync settings from backend", error);
    }
  }

  private canSyncRegistrations(role?: UserRole): boolean {
    return (
      !!role &&
      ["Super Admin", "Admissions", "Registrar", "Principal"].includes(role)
    );
  }

  saveDraft(registration: AdmissionRegistration): void {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...registration, updatedAt: new Date().toISOString() }),
    );
  }

  getDraft(): AdmissionRegistration | null {
    return this.read<AdmissionRegistration | null>(DRAFT_KEY, null);
  }

  clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY);
  }

  upsertRegistration(
    registration: AdmissionRegistration,
  ): AdmissionRegistration {
    const next = { ...registration, updatedAt: new Date().toISOString() };
    const existing = this.registrationsState();
    const exists = existing.some((item) => item.id === next.id);
    const registrations = exists
      ? existing.map((item) => (item.id === next.id ? next : item))
      : [next, ...existing];
    this.registrationsState.set(registrations);
    return next;
  }

  deleteRegistration(id: string): void {
    const registrations = this.registrationsState().filter(
      (item) => item.id !== id,
    );
    this.registrationsState.set(registrations);
  }

  async saveSettings(settings: SchoolSettings): Promise<void> {
    const normalized = this.normalizeSettings(settings);
    this.settingsState.set(normalized);
    await this.api.put("/settings", normalized);
  }

  notify(
    message: string,
    targetRoles: UserRole[] | "all" = "all",
    category: AppNotification["category"] = "admin",
    link?: string,
    sourceId?: string,
  ): void {
    if (
      sourceId &&
      this.notificationsState().some((item) => item.sourceId === sourceId)
    )
      return;

    const notification: AppNotification = {
      id: crypto.randomUUID(),
      message,
      targetRoles,
      category,
      link,
      sourceId,
      createdAt: new Date().toISOString(),
      readBy: [],
    };
    const notifications = [notification, ...this.notificationsState()].slice(
      0,
      50,
    );
    this.notificationsState.set(notifications);
  }

  clearNotifications(): void {
    this.notificationsState.set([]);
  }

  notificationsFor(role?: UserRole): AppNotification[] {
    if (!role) return [];
    return this.notificationsState().filter(
      (item) => item.targetRoles === "all" || item.targetRoles.includes(role),
    );
  }

  unreadNotificationsFor(role?: UserRole, userId?: string): number {
    if (!role || !userId) return 0;
    return this.notificationsFor(role).filter(
      (item) => !item.readBy.includes(userId),
    ).length;
  }

  markNotificationsRead(role?: UserRole, userId?: string): void {
    if (!role || !userId) return;
    const notifications = this.notificationsState().map((item) => {
      const visible =
        item.targetRoles === "all" || item.targetRoles.includes(role);
      if (!visible || item.readBy.includes(userId)) return item;
      return { ...item, readBy: [...item.readBy, userId] };
    });
    this.notificationsState.set(notifications);
  }

  async markNotificationRead(id: string, role?: UserRole, userId?: string): Promise<void> {
    if (!role || !userId) return;
    const previous = this.notificationsState();
    this.notificationsState.set(
      previous.map((item) =>
        item.id === id && !item.readBy.includes(userId)
          ? { ...item, readBy: [...item.readBy, userId] }
          : item,
      ),
    );
    try {
      await this.api.post(`/notifications/${id}/read`, {});
    } catch (error) {
      this.notificationsState.set(previous);
      throw error;
    }
  }

  ensureNotification(
    message: string,
    targetRoles: UserRole[] | "all",
    category: AppNotification["category"],
    link: string,
    sourceId: string,
  ): void {
    this.notify(message, targetRoles, category, link, sourceId);
  }

  hasDuplicate(
    field: "nationalId" | "passportNumber" | "phone" | "email",
    value: string,
    ignoreId?: string,
  ): boolean {
    if (!value?.trim()) return false;
    const normalized = value.trim().toLowerCase();
    return this.registrationsState().some((registration) => {
      if (registration.id === ignoreId) return false;
      const values = [
        registration.student.nationalId,
        registration.student.passportNumber,
        registration.father.phone,
        registration.mother.phone,
        registration.father.email,
        registration.mother.email,
      ].map((item) => item?.trim().toLowerCase());
      if (field === "nationalId") return values[0] === normalized;
      if (field === "passportNumber") return values[1] === normalized;
      if (field === "phone")
        return values[2] === normalized || values[3] === normalized;
      return values[4] === normalized || values[5] === normalized;
    });
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private readSettings(): SchoolSettings {
    return this.normalizeSettings(this.read(SETTINGS_KEY, DEFAULT_SETTINGS));
  }

  private readNotifications(): AppNotification[] {
    const raw = this.read<unknown[]>(NOTIFICATIONS_KEY, []);
    return raw.map((item) => {
      if (typeof item === "string") {
        return {
          id: crypto.randomUUID(),
          message: item,
          targetRoles: "all",
          category: "admin",
          createdAt: new Date().toISOString(),
          readBy: [],
        } satisfies AppNotification;
      }

      const value = item as Partial<AppNotification>;
      return {
        id: value.id || crypto.randomUUID(),
        message: value.message || "",
        targetRoles: value.targetRoles || "all",
        category: value.category || "admin",
        createdAt: value.createdAt || new Date().toISOString(),
        readBy: value.readBy || [],
        link: value.link,
        sourceId: value.sourceId,
      };
    });
  }

  private normalizeSettings(settings: SchoolSettings): SchoolSettings {
    const fees = (settings.fees || DEFAULT_SETTINGS.fees) as Record<
      string,
      number | undefined
    >;
    const { transportation: oldTransportationFee, ...currentFees } = fees;
    const gradeFees = GRADE_LEVELS.reduce(
      (acc, grade) => {
        acc[grade] = {
          ...DEFAULT_GRADE_FEES[grade],
          ...(settings.gradeFees?.[grade] || {}),
        };
        return acc;
      },
      {} as SchoolSettings["gradeFees"],
    );
    const transportationAreas = (
      settings.transportationAreas?.length
        ? settings.transportationAreas
        : DEFAULT_TRANSPORTATION_AREAS
    ).map((area, index) => this.normalizeTransportationArea(area, index));
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      fees: {
        ...DEFAULT_SETTINGS.fees,
        ...currentFees,
        transportationFee:
          fees["transportationFee"] ??
          oldTransportationFee ??
          DEFAULT_SETTINGS.fees["transportationFee"],
      },
      gradeFees,
      transportationAreas,
      paymentPlans: ["Full Payment", "50/50"],
    };
  }

  private normalizeTransportationArea(
    area: Partial<TransportationArea>,
    index: number,
  ): TransportationArea {
    const name = area.name?.trim() || `Area ${index + 1}`;
    return {
      id:
        area.id ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") ||
        crypto.randomUUID(),
      name,
      annualFee: Number(area.annualFee || 0),
    };
  }
}
