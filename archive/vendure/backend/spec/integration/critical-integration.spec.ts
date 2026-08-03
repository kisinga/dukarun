import { MockDb } from '../support/mock-db';

describe('Critical Integration Points', () => {
  describe('Database bootstrap detection', () => {
    it('reflects table state through information_schema queries', async () => {
      const db = new MockDb();
      const infoSchemaSql = `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = current_schema()
          AND table_name = $1
        ) AS exists
      `;

      const before = await db.query(infoSchemaSql, ['ml_extraction_queue']);
      expect(before.rows?.[0].exists).toBe(false);

      db.useMlExtractionQueue();

      const after = await db.query(infoSchemaSql, ['ml_extraction_queue']);
      expect(after.rows?.[0].exists).toBe(true);
    });
  });
});
