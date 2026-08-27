import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { IconComponent } from '../shared/ui/icon.component';
import { SettingsService, type StockLocationRow } from './settings.service';
import { StockLocationsSettingsComponent } from './stock-locations-settings.component';

const locationRows: StockLocationRow[] = [
  {
    id: 'loc-main',
    company_id: 'company-1',
    code: 'MAIN',
    name: 'Main shop',
    is_default: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'loc-west',
    company_id: 'company-1',
    code: 'WEST',
    name: 'West branch',
    is_default: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

describe('StockLocationsSettingsComponent', () => {
  async function render(rows: StockLocationRow[] = locationRows) {
    let currentRows = rows.map(row => ({ ...row }));
    const settingsService = {
      stockLocations: vi.fn(async () => currentRows),
      createStockLocation: vi.fn(async (code: string, name: string, isDefault: boolean) => {
        currentRows = [
          ...currentRows,
          {
            id: 'loc-new',
            company_id: 'company-1',
            code,
            name,
            is_default: isDefault,
            is_active: true,
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
          },
        ];
        return 'loc-new';
      }),
      updateStockLocation: vi.fn().mockResolvedValue('loc-west'),
      deleteStockLocation: vi.fn(async (id: string) => {
        currentRows = currentRows.filter(row => row.id !== id);
        return id;
      }),
    };
    const entitlements = {
      enabled: vi.fn((feature: string) => feature === 'multipleLocations'),
      limit: vi.fn((limit: string) => (limit === 'maxStockLocations' ? 3 : null)),
      refresh: vi.fn().mockResolvedValue(undefined),
      snapshot: vi.fn(() => ({ tierName: 'Growth' })),
    };
    const permissions = {
      has: vi.fn((permission: string) => permission === 'ManageStockAdjustments'),
    };

    await TestBed.configureTestingModule({
      imports: [StockLocationsSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: SettingsService, useValue: settingsService },
        { provide: EntitlementsService, useValue: entitlements },
        { provide: PermissionsService, useValue: permissions },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .overrideComponent(DeleteConfirmationModalComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(StockLocationsSettingsComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Main shop');
    });
    return { fixture, settingsService, entitlements, permissions };
  }

  it('loads stock locations with plan context', async () => {
    const { fixture, settingsService, entitlements } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(settingsService.stockLocations).toHaveBeenCalledOnce();
    expect(entitlements.limit).toHaveBeenCalledWith('maxStockLocations');
    expect(root.textContent).toContain('2 of 3 used');
    expect(root.textContent).toContain('West branch');
  });

  it('creates locations through the stock-location store and refreshes limits', async () => {
    const { fixture, settingsService, entitlements } = await render();
    const component = fixture.componentInstance as any;

    component.startCreate();
    component.name.setValue('East branch');
    component.code.setValue('EAST');
    component.isDefault.setValue(false);
    await component.save();
    fixture.detectChanges();

    expect(settingsService.createStockLocation).toHaveBeenCalledWith('EAST', 'East branch', false);
    expect(settingsService.stockLocations).toHaveBeenCalledTimes(2);
    expect(entitlements.refresh).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Location created');
  });

  it('deletes the selected location and refreshes the list', async () => {
    const { fixture, settingsService } = await render();
    const component = fixture.componentInstance as any;

    component.startDelete(locationRows[1]);
    await component.confirmDelete();
    fixture.detectChanges();

    expect(settingsService.deleteStockLocation).toHaveBeenCalledWith('loc-west');
    expect(settingsService.stockLocations).toHaveBeenCalledTimes(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Location deleted');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('West branch');
  });
});
