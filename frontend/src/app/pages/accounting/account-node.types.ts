import { LedgerAccount } from '@dukarun/ledger';

export interface AccountNode extends LedgerAccount {
  children: AccountNode[];
  calculatedBalance: number;
}

export interface HierarchicalAccounts {
  [key: string]: AccountNode[];
}
