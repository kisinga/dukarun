/**
 * PermissionEditorComponent tests
 *
 * Ensures: open() loads member permissions, all displayed permissions show in grouped panels,
 * apply template updates selection, save calls updateMember.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PermissionEditorComponent } from './permission-editor.component';
import {
  TeamService,
  type Administrator,
  type RoleTemplate,
} from '../../../../core/services/team.service';

describe('PermissionEditorComponent', () => {
  let component: PermissionEditorComponent;
  let fixture: ComponentFixture<PermissionEditorComponent>;
  let teamServiceSpy: jasmine.SpyObj<Pick<TeamService, 'updateMember'>>;

  const memberWithPermissions: Administrator = {
    id: 'admin-1',
    firstName: 'Jane',
    lastName: 'Doe',
    emailAddress: 'jane@test.com',
    user: {
      id: 'u1',
      identifier: 'jane',
      verified: true,
      roles: [
        {
          id: 'r1',
          code: 'cashier',
          permissions: ['ReadOrder', 'CreateOrder', 'ReadCustomer'],
          channels: [{ id: 'ch1' }],
        },
      ],
    },
  };

  const roleTemplates: RoleTemplate[] = [
    {
      code: 'cashier',
      name: 'Cashier',
      description: 'POS and orders',
      permissions: ['ReadOrder', 'CreateOrder', 'ReadCustomer', 'ReadProduct'],
    },
    {
      code: 'manager',
      name: 'Manager',
      description: 'Full access',
      permissions: [
        'ReadOrder',
        'CreateOrder',
        'ReadCustomer',
        'ReadProduct',
        'UpdateOrder',
        'ReadSettings',
      ],
    },
  ];

  beforeEach(async () => {
    teamServiceSpy = jasmine.createSpyObj('TeamService', ['updateMember']);
    teamServiceSpy.updateMember.and.returnValue(Promise.resolve({ ...memberWithPermissions }));

    await TestBed.configureTestingModule({
      imports: [PermissionEditorComponent],
      providers: [{ provide: TeamService, useValue: teamServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(PermissionEditorComponent);
    component = fixture.componentInstance;
    component.roleTemplates = roleTemplates;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('open() sets selectedPermissions from member role permissions', () => {
    component.open(memberWithPermissions);
    expect(component.hasPermission('ReadOrder')).toBe(true);
    expect(component.hasPermission('CreateOrder')).toBe(true);
    expect(component.hasPermission('ReadCustomer')).toBe(true);
    expect(component.hasPermission('ReadProduct')).toBe(false);
  });

  it('getGroupedDisplayedPermissions returns non-empty groups when member has permissions', () => {
    component.member = memberWithPermissions;
    component.open(memberWithPermissions);
    const grouped = component.getGroupedDisplayedPermissions();
    const keys = Object.keys(grouped);
    expect(keys.length).toBeGreaterThan(0);
    expect(grouped['Orders']).toContain('ReadOrder');
    expect(grouped['Orders']).toContain('CreateOrder');
    expect(grouped['Customers']).toContain('ReadCustomer');
  });

  it('getGroupedDisplayedPermissions includes permissions from role templates', () => {
    component.member = memberWithPermissions;
    component.open(memberWithPermissions);
    const grouped = component.getGroupedDisplayedPermissions();
    expect(grouped['Products']).toContain('ReadProduct');
    expect(grouped['Settings']).toBeDefined();
  });

  it('applyTemplate sets selectedPermissions to template permissions (filtered)', () => {
    component.open(memberWithPermissions);
    component.selectedTemplateCode.set('manager');
    component.applyTemplate();
    expect(component.hasPermission('ReadOrder')).toBe(true);
    expect(component.hasPermission('ReadSettings')).toBe(true);
    expect(component.hasPermission('UpdateOrder')).toBe(true);
  });

  it('togglePermission adds and removes permissions', () => {
    component.open(memberWithPermissions);
    expect(component.hasPermission('ReadProduct')).toBe(false);
    component.togglePermission('ReadProduct');
    expect(component.hasPermission('ReadProduct')).toBe(true);
    component.togglePermission('ReadProduct');
    expect(component.hasPermission('ReadProduct')).toBe(false);
  });

  it('save() calls teamService.updateMember with current permissions', async () => {
    component.open(memberWithPermissions);
    component.togglePermission('ReadProduct');
    await component.save();
    expect(teamServiceSpy.updateMember).toHaveBeenCalledWith(
      'admin-1',
      jasmine.arrayContaining(['ReadOrder', 'CreateOrder', 'ReadCustomer', 'ReadProduct']),
    );
  });
});
