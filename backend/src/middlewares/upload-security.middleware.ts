import type { NextFunction, Request, Response } from "express";
import { open, unlink } from "node:fs/promises";

const matches = (mime: string, b: Buffer) =>
  mime === "application/pdf"
    ? b.subarray(0, 5).toString() === "%PDF-"
    : mime === "image/png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/jpeg"
        ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
        : mime === "image/webp"
          ? b.subarray(0, 4).toString() === "RIFF" &&
            b.subarray(8, 12).toString() === "WEBP"
          : ["image/heic", "image/heif"].includes(mime)
            ? b.subarray(4, 8).toString() === "ftyp"
            : false;
export async function validateUploadedFile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.file) {
    next();
    return;
  }
  try {
    const handle = await open(req.file.path, "r");
    const bytes = Buffer.alloc(16);
    await handle.read(bytes, 0, 16, 0);
    await handle.close();
    if (!matches(req.file.mimetype, bytes)) {
      await unlink(req.file.path).catch(() => undefined);
      res
        .status(400)
        .json({
          message: "Uploaded file content does not match its declared type.",
        });
      return;
    }
    next();
  } catch (error) {
    await unlink(req.file.path).catch(() => undefined);
    next(error);
  }
}
