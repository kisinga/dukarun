/**
 * LedgerService tests
 *
 * Ensures loadEligibleDebitAccounts runs the query and sets eligibleDebitAccountsList.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApolloClient } from '@apollo/client';
import { APOLLO_TEST_CLIENT } from '../apollo-test-client.token';
import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  let querySpy: jasmine.Spy;
  let service: LedgerService;

  beforeEach(() => {
    querySpy = jasmine.createSpy('query').and.returnValue(
      Promise.resolve({
        data: {
          eligibleDebitAccounts: {
            items: [
              {
                id: '1',
                code: 'CASH_ON_HAND',
                name: 'Cash on Hand',
                type: 'asset',
                isActive: true,
                balance: 0,
                isParent: false,
              },
              {
                id: '2',
                code: 'BANK_MAIN',
                name: 'Bank Main',
                type: 'asset',
                isActive: true,
                balance: 10000,
                isParent: false,
              },
            ],
          },
        },
      }),
    );
    const fakeClient = { query: querySpy } as unknown as ApolloClient;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LedgerService,
        { provide: APOLLO_TEST_CLIENT, useValue: fakeClient },
      ],
    });

    service = TestBed.inject(LedgerService);
  });

  describe('loadEligibleDebitAccounts', () => {
    it('should run eligibleDebitAccounts query and set eligibleDebitAccountsList', (done) => {
      service.loadEligibleDebitAccounts().subscribe((items) => {
        expect(items.length).toBe(2);
        expect(items[0].code).toBe('CASH_ON_HAND');
        expect(items[1].code).toBe('BANK_MAIN');
        expect(service.eligibleDebitAccountsList().length).toBe(2);
        expect(service.eligibleDebitAccountsList()[0].name).toBe('Cash on Hand');
        done();
      });
    });

    it('should set empty list on query error', (done) => {
      querySpy.and.returnValue(Promise.reject(new Error('Network error')));

      service.loadEligibleDebitAccounts().subscribe((items) => {
        expect(items).toEqual([]);
        expect(service.eligibleDebitAccountsList()).toEqual([]);
        done();
      });
    });
  });
});
