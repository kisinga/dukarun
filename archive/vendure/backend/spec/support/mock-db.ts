import { TransactionalConnection } from '@vendure/core';
import { randomUUID } from 'crypto';

type QueryMatcher = RegExp | ((sql: string) => boolean);

interface QueryResult {
  rows?: any[];
  rowCount?: number;
  [key: string]: any;
}

interface QueryLogEntry {
  sql: string;
  params?: any[];
}

interface QueryHandler {
  matcher: QueryMatcher;
  responder: QueryResponder;
}

interface QueryResponderPayload {
  sql: string;
  params?: any[];
  db: MockDb;
}

type QueryResponder = (payload: QueryResponderPayload) => QueryResult | Promise<QueryResult>;

interface MockDbOptions {
  now?: () => Date;
}

export interface MlExtractionQueueRow {
  id: string;
  channel_id: string;
  scheduled_at: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: Date;
  updated_at: Date;
  error: string | null;
}

/**
 * Lightweight database framework for Jest tests.
 *
 * - Provides a TransactionalConnection-compatible object (rawConnection.query)
 * - Supports registering custom query handlers
 * - Ships with built-in behavior for ml_extraction_queue + information_schema needs
 * - Records executed statements for assertions
 */
export class MockDb {
  readonly connection: TransactionalConnection;

  private readonly nowFactory: () => Date;
  private readonly tables = new Map<string, any[]>();
  private readonly handlers: QueryHandler[] = [];
  private readonly queryLog: QueryLogEntry[] = [];

  constructor(options: MockDbOptions = {}) {
    this.nowFactory = options.now ?? (() => new Date());
    this.connection = {
      rawConnection: {
        query: (sql: string, params?: any[]) => this.execute(sql, params),
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as TransactionalConnection;
  }

  /**
   * Execute a SQL string directly (without going through TransactionalConnection).
   */
  async query(sql: string, params?: any[]): Promise<QueryResult> {
    return this.execute(sql, params);
  }

  /**
   * Register a custom handler for matching queries.
   */
  onQuery(matcher: QueryMatcher, responder: QueryResponder): this {
    this.handlers.push({ matcher, responder });
    return this;
  }

  /**
   * Returns a copy of the executed query log.
   */
  getQueries(): QueryLogEntry[] {
    return [...this.queryLog];
  }

  clearQueries(): void {
    this.queryLog.length = 0;
  }

  /**
   * Enable/seed a table for tests.
   */
  enableTable(tableName: string, rows: any[] = []): this {
    this.tables.set(
      tableName,
      rows.map(row => ({
        ...row,
      }))
    );
    return this;
  }

  /**
   * Seed ml_extraction_queue with optional rows.
   */
  useMlExtractionQueue(rows: Partial<MlExtractionQueueRow>[] = []): this {
    const seeded = rows.map(row => this.normalizeMlRow(row));
    this.tables.set('ml_extraction_queue', seeded);
    return this;
  }

  dropTable(tableName: string): this {
    this.tables.delete(tableName);
    return this;
  }

  hasTable(tableName: string): boolean {
    return this.tables.has(tableName);
  }

  /**
   * Returns a deep copy of the table rows (for assertions).
   */
  getTableRows<T = any>(tableName: string): T[] {
    return (this.tables.get(tableName) || []).map(row => ({ ...row }));
  }

  private async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    this.queryLog.push({ sql, params });

    const handler = this.handlers.find(h => this.matches(h.matcher, sql));
    if (handler) {
      return handler.responder({ sql, params, db: this });
    }

    const infoSchemaResult = this.handleInformationSchemaQuery(sql, params);
    if (infoSchemaResult) {
      return infoSchemaResult;
    }

    const mlQueueResult = this.handleMlExtractionQueueQuery(sql, params);
    if (mlQueueResult) {
      return mlQueueResult;
    }

    return { rows: [], rowCount: 0 };
  }

  private matches(matcher: QueryMatcher, sql: string): boolean {
    if (matcher instanceof RegExp) {
      return matcher.test(sql);
    }
    return matcher(sql);
  }

  private handleInformationSchemaQuery(sql: string, params: any[]): QueryResult | null {
    if (!/information_schema\.tables/i.test(sql)) {
      return null;
    }

    if (/select exists/i.test(sql)) {
      const tableName = this.normalizeTableName(params?.[0]);
      return { rows: [{ exists: this.hasTable(tableName) }] };
    }

    if (/table_name\s+in/i.test(sql) && params.length > 0) {
      const tableNames = params.slice(0, -1).map(name => this.normalizeTableName(name));
      const existing = tableNames
        .filter(name => this.hasTable(name))
        .map(name => ({ table_name: name }));
      return { rows: existing };
    }

    return { rows: Array.from(this.tables.keys()).map(name => ({ table_name: name })) };
  }

  private handleMlExtractionQueueQuery(sql: string, params: any[]): QueryResult | null {
    if (!/ml_extraction_queue/i.test(sql)) {
      return null;
    }

    if (!this.tables.has('ml_extraction_queue')) {
      throw this.missingTableError('ml_extraction_queue');
    }

    const normalized = this.normalizeSql(sql);
    const table = this.tables.get('ml_extraction_queue') as MlExtractionQueueRow[];

    if (normalized.startsWith('insert into ml_extraction_queue')) {
      const [channelId, scheduledAt] = params;
      const now = this.nowFactory();
      const row: MlExtractionQueueRow = {
        id: randomUUID(),
        channel_id: channelId,
        scheduled_at: new Date(scheduledAt),
        status: 'pending',
        created_at: now,
        updated_at: now,
        error: null,
      };
      table.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        "select id, channel_id, scheduled_at, status, created_at, updated_at, error from ml_extraction_queue where status = 'pending'"
      )
    ) {
      const now = this.nowFactory();
      const rows = table
        .filter(row => row.status === 'pending' && row.scheduled_at.getTime() <= now.getTime())
        .sort((a, b) => a.scheduled_at.getTime() - b.scheduled_at.getTime())
        .map(row => ({ ...row }));
      return { rows, rowCount: rows.length };
    }

    if (
      normalized.startsWith(
        "select id from ml_extraction_queue where channel_id = $1 and status = 'pending' and created_at > now() - interval '30 seconds'"
      )
    ) {
      const [channelId] = params;
      const threshold = this.nowFactory().getTime() - 30 * 1000;
      const match = table.find(
        row =>
          row.channel_id === channelId &&
          row.status === 'pending' &&
          row.created_at.getTime() > threshold
      );
      return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
    }

    if (normalized.startsWith('select channel_id from ml_extraction_queue where id = $1')) {
      const [id] = params;
      const match = table.find(row => row.id === id);
      return { rows: match ? [{ channel_id: match.channel_id }] : [], rowCount: match ? 1 : 0 };
    }

    if (normalized.includes("set status = 'processing'")) {
      const [id] = params;
      const updated = this.updateRow(table, id, {
        status: 'processing',
        updated_at: this.nowFactory(),
      });
      return { rowCount: updated ? 1 : 0 };
    }

    if (normalized.includes("set status = 'completed'")) {
      const [id] = params;
      const updated = this.updateRow(table, id, {
        status: 'completed',
        updated_at: this.nowFactory(),
      });
      return { rowCount: updated ? 1 : 0 };
    }

    if (normalized.includes("set status = 'failed', error = $2")) {
      const [id, error] = params;
      const updated = this.updateRow(table, id, {
        status: 'failed',
        error,
        updated_at: this.nowFactory(),
      });
      return { rowCount: updated ? 1 : 0 };
    }

    if (normalized.includes("set status = 'failed', error = 'cancelled by user'")) {
      const [channelId] = params;
      const now = this.nowFactory();
      let affected = 0;
      table.forEach(row => {
        if (row.channel_id === channelId && row.status === 'pending') {
          row.status = 'failed';
          row.error = 'Cancelled by user';
          row.updated_at = now;
          affected++;
        }
      });
      return { rowCount: affected };
    }

    if (normalized.startsWith('delete from ml_extraction_queue')) {
      const threshold = this.nowFactory().getTime() - 7 * 24 * 60 * 60 * 1000;
      const remaining: MlExtractionQueueRow[] = [];
      let removed = 0;
      for (const row of table) {
        if (
          (row.status === 'completed' || row.status === 'failed') &&
          row.updated_at.getTime() < threshold
        ) {
          removed++;
        } else {
          remaining.push(row);
        }
      }
      this.tables.set('ml_extraction_queue', remaining);
      return { rowCount: removed };
    }

    if (
      normalized.startsWith(
        'select id, channel_id, scheduled_at, status, created_at, updated_at, error from ml_extraction_queue where channel_id = $1'
      )
    ) {
      const [channelId, limit] = params;
      const rows = table
        .filter(row => row.channel_id === channelId)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, limit)
        .map(row => ({ ...row }));
      return { rows, rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
  }

  private normalizeMlRow(row: Partial<MlExtractionQueueRow>): MlExtractionQueueRow {
    const now = this.nowFactory();
    return {
      id: row.id ?? randomUUID(),
      channel_id: row.channel_id ?? 'channel',
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at) : now,
      status: row.status ?? 'pending',
      created_at: row.created_at ? new Date(row.created_at) : now,
      updated_at: row.updated_at ? new Date(row.updated_at) : now,
      error: row.error ?? null,
    };
  }

  private updateRow(
    table: MlExtractionQueueRow[],
    id: string,
    updates: Partial<MlExtractionQueueRow>
  ): boolean {
    const target = table.find(row => row.id === id);
    if (!target) {
      return false;
    }
    Object.assign(target, updates);
    return true;
  }

  private normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private normalizeTableName(name?: string): string {
    return (name || '').replace(/"/g, '');
  }

  private missingTableError(tableName: string): Error {
    const error = new Error(`relation "${tableName}" does not exist`);
    (error as any).code = '42P01';
    return error;
  }
}

export function createMockDb(options?: MockDbOptions): MockDb {
  return new MockDb(options);
}
