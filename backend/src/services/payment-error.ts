import { Prisma } from "@prisma/client";
import { ServiceError } from "./service.error.js";

export function classifyPaymentError(error: unknown, step: string): ServiceError {
  if (error instanceof ServiceError) return error;
  const persistence = classifyPersistenceError(error, step, true);
  if (persistence) return persistence;
  const diagnostic = { originalCode: prismaCode(error) || errorName(error), step };
  if (step === "AUTOMATIC_JOURNAL" || step === "JOURNAL_LINES")
    return new ServiceError("The automatic payment journal could not be posted.", 422, "JOURNAL_POSTING_FAILED", diagnostic);
  return new ServiceError("The payment transaction failed and was rolled back.", 500, "PAYMENT_TRANSACTION_FAILED", diagnostic);
}

export function classifyPersistenceError(error: unknown, step: string, paymentContext = false): ServiceError | undefined {
  const code = prismaCode(error);
  const diagnostic = { originalCode: code || errorName(error), step };
  if (["P1000", "P1001", "P1017"].includes(code))
    return new ServiceError("The database is temporarily unavailable.", 503, "DATABASE_UNAVAILABLE", diagnostic);
  if (["P1002", "P1008", "P2024", "P2028"].includes(code))
    return new ServiceError("The payment transaction timed out and was rolled back.", 504, "TRANSACTION_TIMEOUT", diagnostic);
  if (code === "P2002")
    return new ServiceError(paymentContext ? "This payment or receipt has already been recorded." : "A record with the same unique value already exists.", 409, paymentContext ? "DUPLICATE_PAYMENT" : "DUPLICATE_RECORD", diagnostic);
  if (code === "P2003")
    return new ServiceError("The payment allocation references an invalid accounting record.", 422, "INVALID_PAYMENT_ALLOCATION", diagnostic);
  if (code === "P2034")
    return new ServiceError("The payment conflicted with another transaction and was rolled back. Retry with the same receipt number.", 409, "TRANSACTION_CONFLICT", diagnostic);
  return undefined;
}

export function prismaCode(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  if (typeof error === "object" && error && "code" in error) return String((error as any).code || "");
  return "";
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
