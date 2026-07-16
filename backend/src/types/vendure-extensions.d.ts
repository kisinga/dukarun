import { ID, User } from '@vendure/core';

declare module '@vendure/core' {
  /**
   * Custom fields defined in backend/src/config/custom-fields/entity.custom-fields.ts.
   * Augmenting the core class lets the rest of the backend access these fields without
   * resorting to type assertions.
   *
   * Relation custom fields hold the related entity when eager-/relation-loaded,
   * or the foreign-key ID when loaded via customFields only. Typing them as
   * `User | ID | null` keeps both states type-safe.
   */
  interface CustomOrderFields {
    createdByUserId?: User | ID | null;
    lastModifiedByUserId?: User | ID | null;
    reversedByUserId?: User | ID | null;
    cashierPendingAt?: Date | null;
    reversedAt?: Date | null;
  }
}
