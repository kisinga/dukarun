import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PoweredByDukarunComponent } from './powered-by-dukarun.component';

describe('PoweredByDukarunComponent', () => {
  it('renders a labelled link to the public site', async () => {
    await TestBed.configureTestingModule({
      imports: [PoweredByDukarunComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PoweredByDukarunComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('aria-label')).toContain('Powered by Dukarun');
    expect(link.href).toMatch(/^https?:\/\//);
  });
});
