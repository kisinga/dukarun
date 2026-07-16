import { graphql } from '../../shared/graphql/generated';

export const RECORD_EXPENSE = graphql(`
  mutation RecordExpense($input: RecordExpenseInput!) {
    recordExpense(input: $input) {
      sourceId
    }
  }
`);
