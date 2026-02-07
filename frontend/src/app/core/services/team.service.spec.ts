/**
 * TeamService tests
 *
 * Ensures loadMembers filters by active company's channel so the team list
 * only shows admins for the current channel (catches channelId/company.id bugs).
 */

import { TestBed } from '@angular/core/testing';
import { ApolloService } from './apollo.service';
import { CompanyService } from './company.service';
import { TeamService } from './team.service';

describe('TeamService', () => {
  let service: TeamService;
  let mockApolloQuery: jasmine.Spy;
  let mockActiveCompany: { id: string; code: string; token: string } | null;

  beforeEach(() => {
    mockActiveCompany = { id: '2', code: 'channel-2', token: 'token-2' };
    mockApolloQuery = jasmine.createSpy('query').and.returnValue(
      Promise.resolve({
        data: {
          administrators: {
            items: [
              {
                id: '1',
                firstName: 'Alice',
                lastName: 'Admin',
                emailAddress: 'alice@test.com',
                user: {
                  id: 'u1',
                  identifier: 'alice',
                  verified: true,
                  roles: [{ id: 'r1', code: 'admin', permissions: [], channels: [{ id: '2' }] }],
                },
              },
              {
                id: '2',
                firstName: 'Bob',
                lastName: 'Other',
                emailAddress: 'bob@test.com',
                user: {
                  id: 'u2',
                  identifier: 'bob',
                  verified: true,
                  roles: [{ id: 'r2', code: 'cashier', permissions: [], channels: [{ id: '3' }] }],
                },
              },
              {
                id: '3',
                firstName: 'Super',
                lastName: 'Admin',
                emailAddress: 'super@test.com',
                user: {
                  id: 'u3',
                  identifier: 'super',
                  verified: true,
                  roles: [
                    {
                      id: 'r3',
                      code: '__super_admin_role__',
                      permissions: [],
                      channels: [],
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
    );

    const mockApolloService = {
      getClient: jasmine.createSpy('getClient').and.returnValue({ query: mockApolloQuery }),
      setChannelToken: jasmine.createSpy('setChannelToken'),
    };

    const mockCompanyService = {
      activeCompany: jasmine.createSpy('activeCompany').and.callFake(() => mockActiveCompany),
    };

    TestBed.configureTestingModule({
      providers: [
        TeamService,
        { provide: ApolloService, useValue: mockApolloService },
        { provide: CompanyService, useValue: mockCompanyService },
      ],
    });

    service = TestBed.inject(TeamService);
  });

  describe('loadMembers', () => {
    it('filters members by active company channel id', async () => {
      await service.loadMembers();

      const members = service.members();
      expect(members.length).toBe(1);
      expect(members[0].firstName).toBe('Alice');
      expect(members[0].user?.roles?.[0]?.channels?.[0]?.id).toBe('2');
    });

    it('excludes superadmins from the list', async () => {
      await service.loadMembers();

      const members = service.members();
      const superAdmin = members.find((m) => m.firstName === 'Super');
      expect(superAdmin).toBeUndefined();
    });

    it('excludes admins that belong only to other channels', async () => {
      await service.loadMembers();

      const members = service.members();
      const bob = members.find((m) => m.firstName === 'Bob');
      expect(bob).toBeUndefined();
    });

    it('sets empty list and error when no active company', async () => {
      mockActiveCompany = null;

      await service.loadMembers();

      expect(service.members()).toEqual([]);
      expect(service.error()).toBe('No active channel');
    });
  });
});
