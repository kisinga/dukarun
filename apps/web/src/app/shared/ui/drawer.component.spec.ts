import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DrawerComponent } from './drawer.component';
import { IconComponent } from './icon.component';

@Component({
  imports: [DrawerComponent],
  template: `
    <app-drawer [(open)]="open" title="Edit expense">
      <button drawerActions type="button">More expense actions</button>
      <p>Expense form</p>
      <div drawerFooter>
        <button type="button">Save expense</button>
      </div>
    </app-drawer>
  `,
})
class DrawerHostComponent {
  open = true;
}

@Component({
  imports: [DrawerComponent],
  template: `
    <app-drawer [(open)]="open" title="View expense">
      <p>Expense details</p>
    </app-drawer>
  `,
})
class DrawerWithoutFooterHostComponent {
  open = true;
}

@Component({
  imports: [DrawerComponent],
  template: `
    <app-drawer [(open)]="open" title="Post payment" [closeDisabled]="true">
      <p>Posting payment</p>
    </app-drawer>
  `,
})
class LockedDrawerHostComponent {
  open = true;
}

describe('DrawerComponent', () => {
  async function render<T>(host: Type<T>): Promise<ComponentFixture<T>> {
    await TestBed.configureTestingModule({ imports: [host] })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('keeps a projected form action rendered for desktop and mobile layouts', async () => {
    const fixture = await render(DrawerHostComponent);
    const footer = fixture.nativeElement.querySelector('footer') as HTMLElement;

    expect(footer.textContent).toContain('Save expense');
    expect(footer.classList.contains('task-sheet-default-footer')).toBe(false);
  });

  it('projects record actions into the drawer header', async () => {
    const fixture = await render(DrawerHostComponent);
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;

    expect(dialog.textContent).toContain('More expense actions');
    expect(dialog.querySelector('footer')?.textContent).not.toContain('More expense actions');
  });

  it('uses the dismiss fallback only when no action footer is projected', async () => {
    const fixture = await render(DrawerWithoutFooterHostComponent);
    const footer = fixture.nativeElement.querySelector('footer') as HTMLElement;

    expect(footer.textContent).toContain('Done');
    expect(footer.classList.contains('task-sheet-default-footer')).toBe(true);
  });

  it('keeps a non-cancellable command owner mounted while close is disabled', async () => {
    const fixture = await render(LockedDrawerHostComponent);
    const drawer = fixture.debugElement.children[0].componentInstance as DrawerComponent;

    drawer.requestClose();
    fixture.detectChanges();

    expect(fixture.componentInstance.open).toBe(true);
    expect(
      (fixture.nativeElement.querySelector('button[aria-label="Close"]') as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
