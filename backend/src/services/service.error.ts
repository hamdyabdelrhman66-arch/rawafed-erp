export class ServiceError extends Error {
  readonly originalCode?: string;
  readonly step?: string;

  constructor(
    message: string,
    readonly status = 400,
    readonly code = "BUSINESS_RULE_FAILED",
    diagnostic?: { originalCode?: string; step?: string },
  ) {
    super(message);
    this.originalCode = diagnostic?.originalCode;
    this.step = diagnostic?.step;
  }
}
