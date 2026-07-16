import { User } from '@vendure/core';

declare module '@vendure/core' {
  /**
   * Scalar custom fields defined in backend/src/config/custom-fields/entity.custom-fields.ts.
   * Augmenting the core class lets the rest of the backend access these fields without
   * resorting to type assertions.
   */
  interface CustomOrderFields {
    cashierPendingAt?: Date | null;
    reversedAt?: Date | null;
  }

  /**
   * Relation custom fields defined in backend/src/config/custom-fields/entity.custom-fields.ts.
   * Vendure stores relation custom fields as properties on the entity itself.
   */
  interface Order {
    createdByUserId?: User | null;
    lastModifiedByUserId?: User | null;
  }
}
