import v8 from "node:v8";
import type { Logger } from "@matter/general";

// Stop creating new endpoints when heap usage exceeds this fraction of the limit.
const HEAP_PRESSURE_THRESHOLD = 0.85;

/**
 * Log current heap memory usage. Useful for diagnosing OOM issues during startup.
 * Reports heap used / heap total in MB.
 */
export function logMemoryUsage(log: Logger, context: string): void {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  log.debug(
    `Memory [${context}]: heap ${heapUsedMB}/${heapTotalMB} MB, rss ${rssMB} MB`,
  );
}

/**
 * Check if the V8 heap is under memory pressure.
 * Returns true when heap usage exceeds 85% of the configured heap limit.
 * Used to stop loading more endpoints before hitting an OOM crash.
 */
export function isHeapUnderPressure(): boolean {
  const stats = v8.getHeapStatistics();
  return stats.used_heap_size / stats.heap_size_limit > HEAP_PRESSURE_THRESHOLD;
}
