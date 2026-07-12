import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

export const validate =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          message: "Invalid request payload.",
          errors: parsed.error.flatten(),
        });
      return;
    }
    req.body = parsed.data;
    next();
  };
