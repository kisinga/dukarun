import type { LedgerAccount } from '../../../../core/services/ledger/ledger.service';
import type { AccountNode } from '../account-node.types';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

function emptyGroupedAccounts(): Record<string, LedgerAccount[]> {
  return Object.fromEntries(ACCOUNT_TYPES.map((t) => [t, []])) as Record<string, LedgerAccount[]>;
}

function emptyGroupedNodes(): Record<string, AccountNode[]> {
  return Object.fromEntries(ACCOUNT_TYPES.map((t) => [t, []])) as Record<string, AccountNode[]>;
}

/**
 * Groups accounts by type (flat list per type).
 */
export function getAccountsByType(accounts: LedgerAccount[]): Record<string, LedgerAccount[]> {
  const grouped = emptyGroupedAccounts();
  accounts.forEach((account) => {
    if (grouped[account.type]) {
      grouped[account.type].push(account);
    }
  });
  return grouped;
}

/**
 * Builds hierarchical account tree with parent-child relationships and calculated parent balances.
 * Returns root accounts grouped by type, sorted by code (recursively for children).
 */
export function buildHierarchicalAccounts(
  accounts: LedgerAccount[],
): Record<string, AccountNode[]> {
  const accountMap = new Map<string, AccountNode>();
  const rootAccounts: AccountNode[] = [];

  accounts.forEach((account) => {
    accountMap.set(account.id, {
      ...account,
      children: [],
      calculatedBalance: account.balance,
    });
  });

  accounts.forEach((account) => {
    const node = accountMap.get(account.id)!;
    if (account.parentAccountId) {
      const parent = accountMap.get(account.parentAccountId);
      if (parent) {
        parent.children.push(node);
      } else {
        rootAccounts.push(node);
      }
    } else {
      rootAccounts.push(node);
    }
  });

  function calculateParentBalance(node: AccountNode): number {
    if (node.children.length === 0) {
      return node.balance;
    }
    const childrenBalance = node.children.reduce(
      (sum, child) => sum + calculateParentBalance(child),
      0,
    );
    node.calculatedBalance = childrenBalance;
    return childrenBalance;
  }

  rootAccounts.forEach((root) => calculateParentBalance(root));

  const grouped = emptyGroupedNodes();
  rootAccounts.forEach((account) => {
    if (grouped[account.type]) {
      grouped[account.type].push(account);
    }
  });

  function sortChildren(nodes: AccountNode[]): void {
    nodes.forEach((node) => {
      node.children.sort((a, b) => a.code.localeCompare(b.code));
      sortChildren(node.children);
    });
  }

  ACCOUNT_TYPES.forEach((type) => {
    grouped[type].sort((a, b) => a.code.localeCompare(b.code));
    sortChildren(grouped[type]);
  });

  return grouped;
}

/**
 * Returns top accounts by absolute balance (e.g. for overview key accounts).
 */
export function getKeyAccounts(accounts: LedgerAccount[], limit: number = 10): LedgerAccount[] {
  return [...accounts].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, limit);
}
