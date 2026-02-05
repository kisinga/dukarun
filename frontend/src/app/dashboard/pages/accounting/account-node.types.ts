import type { LedgerAccount } from '../../../core/services/ledger/ledger.service';

export interface AccountNode extends LedgerAccount {
  children: AccountNode[];
  calculatedBalance: number;
}

export interface HierarchicalAccounts {
  [key: string]: AccountNode[];
}
