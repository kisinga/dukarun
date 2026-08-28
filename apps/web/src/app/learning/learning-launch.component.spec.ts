import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IconComponent } from '../shared/ui/icon.component';
import { LearningLaunchComponent } from './learning-launch.component';
import { LearningPlatformService } from './learning-platform.service';

describe('LearningLaunchComponent', () => {
  let fixture: ComponentFixture<LearningLaunchComponent>;
  const launch = vi.fn();

  beforeEach(async () => {
    launch.mockReset().mockResolvedValue('vendor-disabled');
    await TestBed.configureTestingModule({
      imports: [LearningLaunchComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ contentKey: 'first-business-cycle' }) },
          },
        },
        { provide: LearningPlatformService, useValue: { launch } },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(LearningLaunchComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('offers the exact written journey when the interactive launch fails', () => {
    expect(fixture.nativeElement.textContent).toContain('The interactive guide could not start.');
    expect(fixture.nativeElement.textContent).not.toContain(
      'Interactive guides are not enabled here yet.'
    );

    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    expect(links.find(link => link.textContent?.includes('Continue in Dukarun'))?.pathname).toBe(
      '/dashboard'
    );
    expect(links.find(link => link.textContent?.includes('Read the written guide'))?.pathname).toBe(
      '/help/journeys/first-business-cycle'
    );
  });
});
