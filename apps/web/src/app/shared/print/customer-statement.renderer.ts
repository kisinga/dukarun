import {
  renderDocument,
  statementContent,
  type DocumentDesign,
  type DocumentIdentity,
} from '@dukarun/documents';
export interface CustomerStatementPrintRow {
  id: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface CustomerStatementPrintData {
  company: DocumentIdentity;
  design?: DocumentDesign;
  customerName: string;
  currency: string;
  generatedAt: string;
  rows: readonly CustomerStatementPrintRow[];
}

export interface RenderedCustomerStatement {
  title: string;
  html: string;
  styles: string;
}

export function renderCustomerStatement(
  data: CustomerStatementPrintData
): RenderedCustomerStatement {
  return renderDocument(statementContent(data), data.design);
}
