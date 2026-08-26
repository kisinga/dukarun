import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IconComponent } from './icon.component';
import { TaskDialogComponent } from './task-dialog.component';

@Component({
  imports: [TaskDialogComponent],
  template: `
    <button id="launcher">Open</button>
    <app-task-dialog [(open)]="open" title="Delivery details" [dirty]="dirty()" [error]="error()">
      <input autofocus aria-label="Recipient" />
      <div taskFooter><button type="button">Done</button></div>
    </app-task-dialog>
  `,
})
class HostComponent {
  open = true;
  dirty = signal(false);
  error = signal<string | null>(null);
}

describe('TaskDialogComponent', () => {
  async function render(focusBeforeOpen?: HTMLElement): Promise<ComponentFixture<HostComponent>> {
    await TestBed.configureTestingModule({ imports: [HostComponent] })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    focusBeforeOpen?.focus();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders one scrollable body and a fixed projected action footer', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.querySelector('.modal-body')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('footer')?.textContent).toContain('Done');
  });

  it('asks before closing a dirty task', async () => {
    const fixture = await render();
    fixture.componentInstance.dirty.set(true);
    fixture.detectChanges();
    const close = fixture.nativeElement.querySelector('button[aria-label="Close"]') as HTMLElement;
    close.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(fixture.componentInstance.open).toBe(true);
  });

  it('keeps task errors visible outside the scrollable form body', async () => {
    const fixture = await render();
    fixture.componentInstance.error.set('Customer could not be saved');
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Customer could not be saved');
    expect(alert.closest('.modal-body')).toBeNull();
  });

  it('routes native cancellation through the dirty confirmation', async () => {
    const fixture = await render();
    fixture.componentInstance.dirty.set(true);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const event = new Event('cancel', { cancelable: true });

    dialog.dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.open).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  it('keeps the panel mounted while closed so the backdrop cannot outlive it', async () => {
    const fixture = await render();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

    fixture.componentInstance.open = false;
    fixture.detectChanges();

    expect(dialog.open).toBe(false);
    expect(fixture.nativeElement.querySelector('.task-dialog-panel')).not.toBeNull();
  });

  it('closes with Escape and restores focus to the launching control', async () => {
    const launcher = document.createElement('button');
    document.body.append(launcher);
    const fixture = await render(launcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(fixture.componentInstance.open).toBe(false);
    expect(document.activeElement).toBe(launcher);
    launcher.remove();
  });
});
