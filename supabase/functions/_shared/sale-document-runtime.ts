type WorkerOptions = {
  servicePath: string;
  cpuTimeSoftLimitMs?: number;
  cpuTimeHardLimitMs?: number;
};

/** Applied by the self-hosted main router, before creating a user worker. */
export function withSaleDocumentCpuBudget<T extends WorkerOptions>(options: T): T {
  const name = options.servicePath.replace(/\/+$/, '').split('/').pop();
  // Both immediate delivery and scheduled recovery currently render in-process.
  if (name !== 'sale-document-send' && name !== 'notification-flush') return options;
  return { ...options, cpuTimeSoftLimitMs: 4000, cpuTimeHardLimitMs: 8000 };
}
