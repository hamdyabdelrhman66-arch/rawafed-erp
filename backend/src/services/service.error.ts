export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "BUSINESS_RULE_FAILED",
  ) {
    super(message);
  }
}
