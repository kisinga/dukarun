/**
 * Migration Test Setup
 *
 * Provides utilities for testing migration idempotence using the shared MockDb.
 */

import { MockDb } from '../support/mock-db';

export class MigrationTestHelper {
  private readonly db = new MockDb();

  async createTestDatabase(databaseName: string): Promise<MockDb> {
    console.log(`Creating mock test database: ${databaseName}`);
    return this.db;
  }

  async cleanupTestDatabase(): Promise<void> {
    console.log('Cleaning up mock test database');
    this.db.dropTable('ml_extraction_queue');
  }

  async runMigrations(): Promise<void> {
    console.log('Running mock migrations');
    this.db.useMlExtractionQueue();
  }

  async getTableColumns(tableName: string): Promise<string[]> {
    const mockColumns = {
      channel: [
        'id',
        'createdAt',
        'updatedAt',
        'code',
        'description',
        'token',
        'customFieldsMlmodeljsonassetid',
        'customFieldsMlmodelbinassetid',
        'customFieldsMlmetadataassetid',
        'customFieldsCompanylogoassetid',
      ],
      payment_method: [
        'id',
        'createdAt',
        'updatedAt',
        'code',
        'name',
        'description',
        'customFieldsImageassetid',
        'customFieldsIsactive',
      ],
      asset: [
        'id',
        'createdAt',
        'updatedAt',
        'name',
        'type',
        'fileSize',
        'mimeType',
        'source',
        'preview',
      ],
    };

    return mockColumns[tableName as keyof typeof mockColumns] || [];
  }

  async verifyMigrationResults(): Promise<boolean> {
    const exists = this.db.hasTable('ml_extraction_queue');
    return exists;
  }

  async cleanup(): Promise<void> {
    // No-op for now; each test owns its own helper.
  }
}
