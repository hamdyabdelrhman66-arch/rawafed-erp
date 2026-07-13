import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";
import { FixedAssetsService } from "../services/fixed-assets.service.js";
import { asyncController } from "./core.controller.js";

const actor = (request: AuthRequest) => ({
  id: request.user?.id,
  displayName: request.user?.displayName,
  role: request.user?.role,
});

export class FixedAssetsController {
  private readonly service: FixedAssetsService;

  constructor(prisma: PrismaClient) {
    this.service = new FixedAssetsService(prisma);
  }

  masterData = asyncController(async (_request, response) =>
    response.json(await this.service.masterData()),
  );
  categories = asyncController(async (_request, response) =>
    response.json(await this.service.categories()),
  );
  createCategory = asyncController(async (request, response) =>
    response
      .status(201)
      .json(await this.service.createCategory(request.body, actor(request))),
  );
  list = asyncController(async (_request, response) =>
    response.json(await this.service.list()),
  );
  get = asyncController(async (request, response) =>
    response.json(await this.service.get(request.params.id)),
  );
  create = asyncController(async (request, response) =>
    response
      .status(201)
      .json(await this.service.create(request.body, actor(request))),
  );
  depreciate = asyncController(async (request, response) =>
    response.json(
      await this.service.depreciate(
        request.params.id,
        request.body,
        actor(request),
      ),
    ),
  );
  runDepreciation = asyncController(async (request, response) =>
    response.json(
      await this.service.runDepreciation(request.body, actor(request)),
    ),
  );
  transfer = asyncController(async (request, response) =>
    response.json(
      await this.service.transfer(
        request.params.id,
        request.body,
        actor(request),
      ),
    ),
  );
  dispose = asyncController(async (request, response) =>
    response.json(
      await this.service.dispose(
        request.params.id,
        request.body,
        actor(request),
      ),
    ),
  );
  addMaintenance = asyncController(async (request, response) =>
    response
      .status(201)
      .json(
        await this.service.addMaintenance(
          request.params.id,
          request.body,
          actor(request),
        ),
      ),
  );
  report = asyncController(async (request, response) =>
    response.json(await this.service.reports(request.params.type)),
  );
}
