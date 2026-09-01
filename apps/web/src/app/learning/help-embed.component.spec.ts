import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import { ThemeService } from '../core/theme.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { IconComponent } from '../shared/ui/icon.component';
import { GITBOOK_PARENT_PROTOCOL, HelpEmbedComponent } from './help-embed.component';
import { LearningPlatformService } from './learning-platform.service';

const gitbook = vi.hoisted(() => ({
  configure: vi.fn(),
  navigateToPage: vi.fn(),
  createFrame: vi.fn(),
  getFrameURL: vi.fn(),
  createGitBook: vi.fn(),
}));
const launchGuide = vi.fn().mockResolvedValue('started');

vi.mock('@gitbook/embed', () => ({ createGitBook: gitbook.createGitBook }));

describe('HelpEmbedComponent', () => {
  const originalSiteUrl = environment.gitbookSiteUrl;

  beforeEach(() => {
    gitbook.configure.mockClear();
    gitbook.navigateToPage.mockClear();
    gitbook.createFrame.mockReset();
    gitbook.getFrameURL.mockReset();
    gitbook.createGitBook.mockReset();
    gitbook.createFrame.mockReturnValue({
      configure: gitbook.configure,
      navigateToPage: gitbook.navigateToPage,
    });
    gitbook.getFrameURL.mockReturnValue('https://embed.example.test/frame');
    gitbook.createGitBook.mockReturnValue({
      createFrame: gitbook.createFrame,
      getFrameURL: gitbook.getFrameURL,
    });
    launchGuide.mockClear();
  });

  afterEach(() => {
    environment.gitbookSiteUrl = originalSiteUrl;
    TestBed.resetTestingModule();
  });

  async function render(input: {
    routePattern: string;
    params?: Record<string, string>;
    offline?: boolean;
    protocol?: string;
  }): Promise<ComponentFixture<HelpEmbedComponent>> {
    const params = convertToParamMap(input.params ?? {});
    await TestBed.configureTestingModule({
      imports: [HelpEmbedComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(params),
            snapshot: { routeConfig: { path: input.routePattern } },
          },
        },
        {
          provide: ConnectivityService,
          useValue: { offline: signal(input.offline ?? false) },
        },
        { provide: GITBOOK_PARENT_PROTOCOL, useValue: input.protocol ?? 'https:' },
        { provide: LearningPlatformService, useValue: { launch: launchGuide } },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(HelpEmbedComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('keeps an explicit first-party state while GitBook is not configured', async () => {
    environment.gitbookSiteUrl = '';
    const fixture = await render({ routePattern: 'help' });

    expect(fixture.nativeElement.textContent).toContain('Dukarun Guide is being connected');
    expect(fixture.nativeElement.querySelector('iframe')?.title).toBe('Dukarun Guide');
  });

  it('maps an exact topic URL and keeps an external fallback while offline', async () => {
    environment.gitbookSiteUrl = 'https://docs.example.test';
    const fixture = await render({
      routePattern: 'help/topics/:topic',
      params: { topic: 'creating-a-product' },
      offline: true,
    });

    expect(fixture.nativeElement.textContent).toContain(
      'Dukarun Guide needs an internet connection'
    );
    const external = fixture.nativeElement.querySelector('a[target="_blank"]') as HTMLAnchorElement;
    expect(external.href).toBe('https://docs.example.test/products/creating-a-product');
  });

  it('opens the exact category in a responsive Assistant, search, and docs frame', async () => {
    environment.gitbookSiteUrl = 'https://docs.example.test';
    const fixture = await render({
      routePattern: 'help/categories/:domain',
      params: { domain: 'products' },
    });
    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    const surface = fixture.nativeElement.querySelector('section') as HTMLElement;

    expect(gitbook.getFrameURL).toHaveBeenCalledWith({});
    expect(surface.className).toContain('100dvh');
    expect(iframe.className).toContain('h-full');
    expect(iframe.className).toContain('w-full');
    expect(iframe.style.colorScheme).toBe(TestBed.inject(ThemeService).theme());
    (fixture.componentInstance as any).frameLoaded();
    fixture.detectChanges();

    expect(gitbook.createFrame).toHaveBeenCalledWith(iframe);
    expect(gitbook.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        tabs: ['assistant', 'search', 'docs'],
        actions: [
          expect.objectContaining({
            label: 'Start your first business cycle',
            onClick: expect.any(Function),
          }),
        ],
      })
    );
    expect(gitbook.configure.mock.calls.at(-1)?.[0]).not.toHaveProperty('suggestions');
    expect(gitbook.configure.mock.calls.at(-1)?.[0]).not.toHaveProperty('tools');
    expect(gitbook.navigateToPage).toHaveBeenCalledWith('/products');
    expect(fixture.nativeElement.textContent).not.toContain('Opening Dukarun Guide');
    expect(fixture.nativeElement.textContent).not.toContain('Articles, search, relationships');

    (fixture.componentInstance as any).frameLoaded();
    expect(gitbook.createFrame).toHaveBeenCalledOnce();
  });

  it('makes interactive learning prominent and launches it through the current app router', async () => {
    environment.gitbookSiteUrl = 'https://docs.example.test';
    const fixture = await render({ routePattern: 'help' });

    expect(fixture.nativeElement.textContent).toContain('Learn by doing');
    expect(fixture.nativeElement.textContent).toContain(
      'complete the requested action before choosing Next'
    );
    const launch = fixture.nativeElement.querySelector('header button') as HTMLButtonElement;
    expect(launch.textContent).toContain('Start your first business cycle');

    launch.click();

    expect(launchGuide).toHaveBeenCalledWith('first-business-cycle', { continue: true });
  });

  it('adds a same-tab walkthrough action to an exact GitBook topic', async () => {
    environment.gitbookSiteUrl = 'https://docs.example.test';
    const fixture = await render({
      routePattern: 'help/topics/:topic',
      params: { topic: 'creating-a-product' },
    });

    expect(gitbook.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [
          expect.objectContaining({
            icon: 'play',
            label: 'Start creating a product',
            onClick: expect.any(Function),
          }),
        ],
      })
    );
    const launch = fixture.nativeElement.querySelector('header button') as HTMLButtonElement;
    expect(launch.textContent).toContain('Start interactive guide');

    launch.click();

    expect(launchGuide).toHaveBeenCalledWith('creating-a-product', { continue: false });
  });

  it('opens the written journey and launches its interactive action in the same tab', async () => {
    environment.gitbookSiteUrl = 'https://docs.example.test';
    await render({
      routePattern: 'help/journeys/:topic',
      params: { topic: 'first-business-cycle' },
    });

    expect(gitbook.navigateToPage).toHaveBeenCalledWith('/journeys/first-business-cycle');
    const settings = gitbook.configure.mock.calls.at(-1)?.[0] as
      { actions?: Array<{ label: string; onClick: () => void | Promise<void> }> } | undefined;
    const action = settings?.actions?.[0];
    expect(action?.label).toBe('Start your first business cycle');
    await action?.onClick();
    expect(launchGuide).toHaveBeenCalledWith('first-business-cycle', { continue: true });
  });

  it('replaces GitBook frame refusal with a first-party fallback on HTTP previews', async () => {
    environment.gitbookSiteUrl = 'https://docs.example.test';
    const fixture = await render({ routePattern: 'help', protocol: 'http:' });

    expect(fixture.nativeElement.textContent).toContain('Dukarun Guide needs HTTPS');
    expect(fixture.nativeElement.textContent).toContain('npm run dev:web:https');
    expect(gitbook.createGitBook).not.toHaveBeenCalled();
    const external = fixture.nativeElement.querySelector(
      'a.btn-primary[target="_blank"]'
    ) as HTMLAnchorElement;
    expect(external.href).toBe('https://docs.example.test/');
  });
});
