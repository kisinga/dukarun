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

  it('hides redundant navigation when only one section is available', async () => {
    items = [{ label: 'Messages', route: '/activity/messages' }];
    await render();

    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('renders desktop route navigation and a mobile selector for multiple sections', async () => {
    items = [
      { label: 'Messages', route: '/activity/messages' },
      { label: 'Audit trail', route: '/activity/audit' },
    ];
    await router.navigateByUrl('/activity/messages');
    await render();

    const navigation = fixture.nativeElement.querySelector('nav') as HTMLElement;
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(navigation.textContent).toContain('Messages');
    expect(navigation.textContent).toContain('Audit trail');
    expect(select.getAttribute('aria-label')).toBe('Activity section');
    expect(select.value).toBe('/activity/messages');
    const activeLink = navigation.querySelector('[aria-current="page"]') as HTMLElement;
    expect(activeLink.textContent).toContain('Messages');
    expect(activeLink.classList.contains('nav-item-active')).toBe(true);

    select.value = '/activity/audit';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(router.url).toBe('/activity/audit');
  });
});
