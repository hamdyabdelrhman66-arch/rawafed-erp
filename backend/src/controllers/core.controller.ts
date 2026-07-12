import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";
import { AuthService } from "../services/auth.service.js";
import { FinanceService } from "../services/finance.service.js";
import { NotificationsService } from "../services/notifications.service.js";
import { RegistrationsService } from "../services/registrations.service.js";
import { SettingsService } from "../services/settings.service.js";
import { StudentsService } from "../services/students.service.js";
import { UploadsService } from "../services/uploads.service.js";
import { UsersService } from "../services/users.service.js";
import { ServiceError } from "../services/service.error.js";

type CoreRequest = AuthRequest & { params: Record<string, string> };
export const asyncController =
  (fn: (req: CoreRequest, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req as CoreRequest, res).catch(next);
const page = (req: Request) => ({
  skip: Math.max(0, Number(req.query.offset || 0)),
  take: Math.min(200, Math.max(1, Number(req.query.limit || 100))),
});
const actor = (req: AuthRequest) => ({
  id: req.user?.id,
  displayName: req.user?.displayName,
  role: req.user?.role,
});

export class CoreController {
  private auth;
  private users;
  private registrations;
  private students;
  private notifications;
  private settings;
  private uploads;
  private finance;
  constructor(prisma: PrismaClient) {
    this.auth = new AuthService(prisma);
    this.users = new UsersService(prisma);
    this.registrations = new RegistrationsService(prisma);
    this.students = new StudentsService(prisma);
    this.notifications = new NotificationsService(prisma);
    this.settings = SettingsService.using(prisma);
    this.uploads = new UploadsService(prisma);
    this.finance = new FinanceService(prisma);
  }
  login = asyncController(async (req, res) =>
    res.json(await this.auth.login(req.body.username, req.body.password)),
  );
  refresh = asyncController(async (req, res) =>
    res.json(await this.auth.refresh(req.body.refreshToken)),
  );
  logout = asyncController(async (req, res) => {
    await this.auth.logout(req.user!.id, req.user?.role, req.body.refreshToken);
    res.status(204).send();
  });
  me = asyncController(async (req, res) => res.json({ user: req.user }));
  listUsers = asyncController(async (req, res) =>
    res.json(await this.users.list(page(req).skip, page(req).take)),
  );
  createUser = asyncController(async (req, res) =>
    res.status(201).json(await this.users.create(req.body, actor(req))),
  );
  updateUser = asyncController(async (req, res) =>
    res.json(await this.users.update(req.params.id, req.body, actor(req))),
  );
  password = asyncController(async (req, res) =>
    res.json(
      await this.users.password(req.params.id, req.body.password, actor(req)),
    ),
  );
  userStatus = asyncController(async (req, res) =>
    res.json(
      await this.users.status(req.params.id, req.body.active, actor(req)),
    ),
  );
  publicRegistration = asyncController(async (req, res) =>
    res.status(201).json(await this.registrations.create(req.body)),
  );
  createRegistration = asyncController(async (req, res) =>
    res.status(201).json(await this.registrations.create(req.body, actor(req))),
  );
  registrationsList = asyncController(async (req, res) =>
    res.json(await this.registrations.list(page(req).skip, page(req).take)),
  );
  registrationStatus = asyncController(async (req, res) =>
    res.json(
      await this.registrations.setStatus(
        req.params.id,
        req.body.status,
        actor(req),
      ),
    ),
  );
  studentsList = asyncController(async (req, res) =>
    res.json(await this.students.list(page(req).skip, page(req).take)),
  );
  student = asyncController(async (req, res) =>
    res.json(await this.students.get(req.params.id)),
  );
  studentFromRegistration = asyncController(async (req, res) =>
    res
      .status(201)
      .json(
        await this.students.fromRegistration(
          req.params.registrationId,
          actor(req),
        ),
      ),
  );
  updateStudent = asyncController(async (req, res) =>
    res.json(await this.students.update(req.params.id, req.body, actor(req))),
  );
  archiveStudent = asyncController(async (req, res) => {
    await this.students.archive(req.params.id, actor(req));
    res.status(204).send();
  });
  notificationsList = asyncController(async (req, res) =>
    res.json(
      await this.notifications.list(
        req.user!.role,
        page(req).skip,
        page(req).take,
      ),
    ),
  );
  notificationRead = asyncController(async (req, res) => {
    await this.notifications.markRead(req.params.id, req.user!.role);
    res.status(204).send();
  });
  settingsGet = asyncController(async (_req, res) =>
    res.json(await this.settings.get()),
  );
  settingsPut = asyncController(async (req, res) =>
    res.json(await this.settings.update(req.body)),
  );
  upload = asyncController(async (req, res) => {
    const file = req.file;
    if (!file)
      throw new ServiceError("No file uploaded.", 400, "VALIDATION_ERROR");
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res
      .status(201)
      .json(
        await this.uploads.create(
          {
            id: crypto.randomUUID(),
            originalName: file.originalname,
            fileName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            url: `${baseUrl}/uploads/${encodeURIComponent(file.filename)}`,
            label: req.body.label,
            ownerId: req.body.ownerId,
            uploadedBy: req.user?.displayName || "public-registration",
          },
          req.user ? actor(req) : undefined,
        ),
      );
  });
  removeUpload = asyncController(async (req, res) => {
    await this.uploads.remove(req.params.id, actor(req));
    res.status(204).send();
  });
  accounts = asyncController(async (req, res) =>
    res.json(await this.finance.accounts(page(req).skip, page(req).take)),
  );
  invoices = asyncController(async (req, res) =>
    res.json(await this.finance.invoices(page(req).skip, page(req).take)),
  );
  payments = asyncController(async (req, res) =>
    res.json(await this.finance.payments(page(req).skip, page(req).take)),
  );
  createInvoice = asyncController(async (req, res) =>
    res
      .status(201)
      .json(await this.finance.createInvoice(req.body, actor(req))),
  );
  createPayment = asyncController(async (req, res) =>
    res
      .status(201)
      .json(await this.finance.createPayment(req.body, actor(req))),
  );
}
