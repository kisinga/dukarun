import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  WorkspaceNavItem,
  WorkspaceNavigationService,
} from '../../core/workspace-navigation.service';
import { WorkspaceNavigationComponent } from './workspace-navigation.component';

@Component({ template: 'Messages' })
class MessagesTestComponent {}

@Component({ template: 'Audit' })
class AuditTestComponent {}

@Component({
  imports: [WorkspaceNavigationComponent],
  template: '<app-workspace-navigation workspace="activity" label="Activity" />',
})
class WorkspaceNavigationHostComponent {}

describe('WorkspaceNavigationComponent', () => {
  let fixture: ComponentFixture<WorkspaceNavigationHostComponent>;
  let router: Router;
  let items: WorkspaceNavItem[];

  beforeEach(async () => {
    items = [];
    await TestBed.configureTestingModule({
      imports: [WorkspaceNavigationHostComponent],
      providers: [
        provideRouter([
          { path: 'activity/messages', component: MessagesTestComponent },
          { path: 'activity/audit', component: AuditTestComponent },
        ]),
        {
          provide: WorkspaceNavigationService,
          useValue: { items: () => items },
        },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(WorkspaceNavigationHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('hides redundant navigation when only one view is available', async () => {
    items = [{ label: 'Messages', route: '/activity/messages' }];
    await render();

    expect(fixture.nativeElement.querySelector('[role="tablist"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Current view"]')?.textContent
    ).toContain('Messages');
  });

  it('renders desktop tabs and a mobile selector for multiple views', async () => {
    items = [
      { label: 'Messages', route: '/activity/messages' },
      { label: 'Audit trail', route: '/activity/audit' },
    ];
    await router.navigateByUrl('/activity/messages');
    await render();

    const tablist = fixture.nativeElement.querySelector('[role="tablist"]') as HTMLElement;
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(tablist.textContent).toContain('Messages');
    expect(tablist.textContent).toContain('Audit trail');
    expect(select.getAttribute('aria-label')).toBe('Activity view');
    expect(select.value).toBe('/activity/messages');
    const activeTab = tablist.querySelector('[aria-selected="true"]') as HTMLElement;
    expect(activeTab.textContent).toContain('Messages');
    expect(activeTab.classList.contains('section-tab-active')).toBe(true);

    select.value = '/activity/audit';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(router.url).toBe('/activity/audit');
  });
});
