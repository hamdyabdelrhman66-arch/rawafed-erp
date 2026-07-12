import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestMetrics {
  requestId: string;
  databaseMs: number;
  databaseQueries: number;
}
const storage = new AsyncLocalStorage<RequestMetrics>();
export const requestContext = {
  run<T>(metrics: RequestMetrics, callback: () => T) {
    return storage.run(metrics, callback);
  },
  current() {
    return storage.getStore();
  },
  recordDatabase(durationMs: number) {
    const current = storage.getStore();
    if (current) {
      current.databaseMs += durationMs;
      current.databaseQueries += 1;
    }
  },
};
