import { Injectable, inject, signal } from '@angular/core';
import { ApolloService } from '../apollo.service';
import { map, catchError, of, from } from 'rxjs';
import { gql } from '@apollo/client/core';
import {
  GetLedgerAccountsDocument,
  GetJournalEntriesDocument,
  GetJournalEntryDocument,
} from '../../graphql/generated/graphql';

const GetPaymentSourceAccountsDocument = gql`
  query GetPaymentSourceAccounts {
    paymentSourceAccounts {
      items {
        id
        code
        name
        type
        isActive
        balance
        parentAccountId
        isParent
      }
    }
  }
`;

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  balance: number;
  parentAccountId?: string | null;
  isParent: boolean;
}

export interface JournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  meta?: Record<string, any> | null;
}

export interface JournalEntry {
  id: string;
  entryDate: string;
  postedAt: string;
  sourceType: string;
  sourceId: string;
  memo?: string | null;
  lines: JournalLine[];
}

export interface JournalEntriesOptions {
  accountCode?: string;
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  take?: number;
  skip?: number;
}

@Injectable({
  providedIn: 'root',
})
export class LedgerService {
  private readonly apolloService = inject(ApolloService);

  readonly accounts = signal<LedgerAccount[]>([]);
  readonly paymentSourceAccountsList = signal<LedgerAccount[]>([]);
  readonly entries = signal<JournalEntry[]>([]);
  readonly totalEntries = signal(0);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  loadPaymentSourceAccounts() {
    this.error.set(null);
    const client = this.apolloService.getClient();
    const queryPromise = client.query<{ paymentSourceAccounts: { items: LedgerAccount[] } }>({
      query: GetPaymentSourceAccountsDocument,
      fetchPolicy: 'network-only',
    });
    return from(queryPromise).pipe(
      map((result) => {
        if (result.data?.paymentSourceAccounts?.items) {
          this.paymentSourceAccountsList.set(result.data.paymentSourceAccounts.items);
          return result.data.paymentSourceAccounts.items;
        }
        this.paymentSourceAccountsList.set([]);
        return [];
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to load payment source accounts');
        this.paymentSourceAccountsList.set([]);
        return of([]);
      }),
    );
  }

  loadAccounts() {
    this.error.set(null);

    const client = this.apolloService.getClient();
    const queryPromise = client.query<{ ledgerAccounts: { items: LedgerAccount[] } }>({
      query: GetLedgerAccountsDocument,
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        if (result.data) {
          this.accounts.set(result.data.ledgerAccounts.items);
          return result.data.ledgerAccounts.items;
        }
        this.accounts.set([]);
        return [];
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to load accounts');
        this.accounts.set([]);
        return of([]);
      }),
    );
  }

  loadJournalEntries(options?: JournalEntriesOptions) {
    this.error.set(null);

    const client = this.apolloService.getClient();
    const queryPromise = client.query<{
      journalEntries: { items: JournalEntry[]; totalItems: number };
    }>({
      query: GetJournalEntriesDocument,
      variables: { options },
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        if (result.data) {
          this.entries.set(result.data.journalEntries.items);
          this.totalEntries.set(result.data.journalEntries.totalItems);
          return result.data.journalEntries;
        }
        this.entries.set([]);
        this.totalEntries.set(0);
        return { items: [], totalItems: 0 };
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to load journal entries');
        this.entries.set([]);
        this.totalEntries.set(0);
        return of({ items: [], totalItems: 0 });
      }),
    );
  }

  getJournalEntry(id: string) {
    const client = this.apolloService.getClient();
    const queryPromise = client.query<{ journalEntry: JournalEntry | null }>({
      query: GetJournalEntryDocument,
      variables: { id },
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => (result.data ? result.data.journalEntry : null)),
      catchError((err) => {
        this.error.set(err.message || 'Failed to load journal entry');
        return of(null);
      }),
    );
  }
}
