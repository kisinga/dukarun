import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { appUrl } from '../../core/public-url';
import { IconComponent } from '../../shared/ui/icon.component';

interface HardwareChoice {
  readonly icon: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly copy: string;
  readonly points: readonly string[];
}

@Component({
  selector: 'app-hardware-docs',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="overflow-hidden border-b border-base-300/60 bg-base-200/55">
      <div
        class="mkt-container grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.05fr_.95fr]"
      >
        <div>
          <a
            routerLink="/docs"
            class="inline-flex min-h-11 items-center text-sm font-semibold text-base-content/60 hover:text-primary"
          >
            <span aria-hidden="true">←</span>
            <span class="ml-2">Getting started</span>
          </a>
          <span class="mkt-eyebrow mt-4 block">Hardware setup</span>
          <h1 class="mkt-h1 mt-3 max-w-3xl">
            Scan and print with hardware your device understands.
          </h1>
          <p class="mkt-lead mt-5 max-w-2xl">
            Dukarun uses your phone camera, keyboard-style scanners, and the normal system print
            service. Use this checklist before buying hardware, then run a test before printing a
            full batch.
          </p>
          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#choose" class="btn btn-primary min-h-11">
              Choose your setup
              <app-icon name="heroArrowRight" size="sm" />
            </a>
            <a href="#troubleshooting" class="btn btn-outline min-h-11">Troubleshoot printing</a>
          </div>
        </div>

        <div class="relative mx-auto w-full max-w-lg" aria-hidden="true">
          <div class="absolute -inset-8 rounded-full bg-primary/10 blur-3xl"></div>
          <div
            class="relative grid gap-3 rounded-[1.5rem] border border-base-300/70 bg-base-100 p-4 shadow-overlay sm:p-6"
          >
            <div class="flex items-center gap-4 rounded-box bg-base-200/65 p-4">
              <span
                class="flex size-11 items-center justify-center rounded-field bg-primary/10 text-primary"
              >
                <app-icon name="heroDevicePhoneMobile" size="lg" />
              </span>
              <div>
                <p class="text-sm font-semibold">Scan on the phone</p>
                <p class="mb-0 text-xs text-base-content/55">No separate scanner required</p>
              </div>
              <app-icon name="heroCheckCircle" size="lg" class="ml-auto text-success" />
            </div>
            <div class="flex items-center gap-4 rounded-box bg-base-200/65 p-4">
              <span
                class="flex size-11 items-center justify-center rounded-field bg-primary/10 text-primary"
              >
                <app-icon name="heroPrinter" size="lg" />
              </span>
              <div>
                <p class="text-sm font-semibold">Print through the system</p>
                <p class="mb-0 text-xs text-base-content/55">Bluetooth, USB, or network</p>
              </div>
              <app-icon name="heroCheckCircle" size="lg" class="ml-auto text-success" />
            </div>
            <div
              class="rounded-box border border-dashed border-primary/30 bg-primary/5 p-5 text-center"
            >
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Test first
              </p>
              <div class="receipt-barcode mx-auto mt-3 w-40 text-base-content"></div>
              <p class="mb-0 mt-2 font-mono text-xs text-base-content/55">DRTEST123456</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="choose" class="scroll-mt-24 bg-base-100 py-14 sm:py-20">
      <div class="mkt-container">
        <div class="max-w-2xl">
          <span class="mkt-eyebrow">Choose only what you need</span>
          <h2 class="mkt-h2 mt-2">Three jobs, three hardware choices</h2>
          <p class="mkt-lead mt-3">
            Scanning, label printing, and receipt printing are separate jobs. A device that does one
            is not automatically suitable for the others.
          </p>
        </div>
        <div class="mt-10 grid gap-5 lg:grid-cols-3">
          @for (choice of choices; track choice.title) {
            <article class="mkt-card flex flex-col p-6 sm:p-7">
              <span
                class="flex size-11 items-center justify-center rounded-field bg-primary/10 text-primary"
              >
                <app-icon [name]="choice.icon" size="lg" />
              </span>
              <p class="mkt-eyebrow mt-6">{{ choice.eyebrow }}</p>
              <h3 class="mt-2 text-xl font-bold tracking-tight">{{ choice.title }}</h3>
              <p class="mt-3 text-sm leading-relaxed text-base-content/70">{{ choice.copy }}</p>
              <ul
                class="mt-5 space-y-3 border-t border-base-300/60 pt-5 text-sm text-base-content/75"
              >
                @for (point of choice.points; track point) {
                  <li class="flex gap-2.5">
                    <app-icon name="heroCheck" size="sm" class="mt-0.5 text-primary" />
                    <span>{{ point }}</span>
                  </li>
                }
              </ul>
            </article>
          }
        </div>
      </div>
    </section>

    <section class="bg-base-200/55 py-14 sm:py-20" aria-labelledby="compatibility-heading">
      <div class="mkt-container grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-14">
        <div>
          <span class="mkt-eyebrow">Before you buy</span>
          <h2 id="compatibility-heading" class="mkt-h2 mt-2">The compatibility check</h2>
          <p class="mt-4 leading-relaxed text-base-content/70">
            A Bluetooth badge alone is not enough. Confirm that the printer is visible in the phone
            or computer's normal print dialog and supports the media you intend to use.
          </p>
          <div
            class="mt-6 rounded-box border border-warning/30 bg-warning/10 p-5 text-sm leading-relaxed"
          >
            <p class="font-semibold">Dukarun does not connect directly to printer hardware.</p>
            <p class="mb-0 mt-1 text-base-content/70">
              Every job opens the system print dialog. Silent printing and direct Bluetooth or USB
              commands are not part of the integration.
            </p>
          </div>
        </div>
        <div class="overflow-hidden rounded-box border border-base-300/70 bg-base-100 shadow-sm">
          <div
            class="grid grid-cols-[1fr_auto] gap-4 border-b border-base-300/60 bg-base-200/50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-base-content/55"
          >
            <span>Confirm</span>
            <span>Required result</span>
          </div>
          @for (check of compatibility; track check.label) {
            <div
              class="grid gap-2 border-b border-base-300/50 px-5 py-4 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
            >
              <span class="font-medium">{{ check.label }}</span>
              <span class="text-sm text-base-content/65 sm:text-right">{{ check.result }}</span>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="setup-heading">
      <div class="mkt-container max-w-4xl">
        <div class="text-center">
          <span class="mkt-eyebrow">Set up once</span>
          <h2 id="setup-heading" class="mkt-h2 mt-2">Install, test, then commit</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-2xl">
            A successful test label should be aligned, readable, and scannable before you print the
            catalogue.
          </p>
        </div>
        <ol class="mt-10 grid gap-4 sm:grid-cols-2">
          @for (step of setupSteps; track step.title) {
            <li class="rounded-box border border-base-300/60 bg-base-100 p-6 shadow-sm">
              <span class="text-sm font-bold tabular-nums text-primary">0{{ $index + 1 }}</span>
              <h3 class="mt-2 font-semibold">{{ step.title }}</h3>
              <p class="mb-0 mt-2 text-sm leading-relaxed text-base-content/70">{{ step.copy }}</p>
            </li>
          }
        </ol>
      </div>
    </section>

    <section id="troubleshooting" class="scroll-mt-24 bg-base-200/55 py-14 sm:py-20">
      <div class="mkt-container max-w-4xl">
        <div class="text-center">
          <span class="mkt-eyebrow">Troubleshooting</span>
          <h2 class="mkt-h2 mt-2">Fix the print path, not the barcode data</h2>
        </div>
        <div class="mt-10 grid gap-3">
          @for (item of troubleshooting; track item.problem) {
            <details class="group rounded-box border border-base-300/60 bg-base-100 p-5 shadow-sm">
              <summary
                class="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-semibold"
              >
                {{ item.problem }}
                <span
                  class="text-xl font-normal text-primary group-open:rotate-45"
                  aria-hidden="true"
                  >+</span
                >
              </summary>
              <p
                class="mb-0 mt-3 max-w-3xl border-t border-base-300/60 pt-3 text-sm leading-relaxed text-base-content/70"
              >
                {{ item.fix }}
              </p>
            </details>
          }
        </div>
      </div>
    </section>

    <section class="bg-neutral text-neutral-content">
      <div
        class="mkt-container flex flex-col gap-6 py-14 sm:flex-row sm:items-center sm:justify-between sm:py-16"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Ready to test?
          </p>
          <h2 class="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Start with the phone in your hand.
          </h2>
          <p class="mb-0 mt-3 max-w-2xl text-neutral-content/65">
            Create one service or product, assign a barcode, and prove the workflow before buying
            more equipment.
          </p>
        </div>
        <a [href]="appUrl('/register')" class="btn btn-primary min-h-12 shrink-0 px-6">
          Create your account
          <app-icon name="heroArrowRight" size="sm" />
        </a>
      </div>
    </section>
  `,
})
export class HardwareComponent {
  protected readonly appUrl = appUrl;

  protected readonly choices: readonly HardwareChoice[] = [
    {
      icon: 'heroDevicePhoneMobile',
      eyebrow: 'Scanning',
      title: 'Start with the phone camera',
      copy: 'On POS → Sell, tap Scan and point the camera at a barcode. This is enough for a phone-first counter or a mobile team.',
      points: [
        'No dedicated scanner required',
        'Works for products and services',
        'A scan adds one matching item to the sale',
      ],
    },
    {
      icon: 'heroPrinter',
      eyebrow: 'Adhesive labels',
      title: 'Use a label printer for barcodes',
      copy: 'Choose a printer that accepts 50 × 30 mm adhesive labels and appears in the device print dialog. A4 sheets are also supported.',
      points: [
        'Compact roll: 50 × 30 mm',
        'A4 sheet: 3 columns × 7 rows',
        'Print a test label before a catalogue batch',
      ],
    },
    {
      icon: 'heroClipboardDocumentList',
      eyebrow: 'Customer receipts',
      title: 'Use a receipt printer for receipts',
      copy: 'Receipt printers use continuous paper rather than adhesive labels. Dukarun provides compact 52 mm and 80 mm receipt layouts.',
      points: [
        '52 mm and 80 mm compact formats',
        'A4 documents remain available',
        'Do not assume a receipt printer can print labels',
      ],
    },
  ];

  protected readonly compatibility = [
    { label: 'Device print service', result: 'Printer appears in the normal print dialog' },
    { label: 'Connection', result: 'Bluetooth, USB, or network connection works outside Dukarun' },
    { label: 'Label media', result: 'Driver supports 50 × 30 mm labels or A4 sheets' },
    { label: 'Receipt media', result: 'Driver supports the selected 52 mm or 80 mm roll' },
    { label: 'Print controls', result: '100% scale, portrait, no browser headers' },
  ] as const;

  protected readonly setupSteps = [
    {
      title: 'Install the printer',
      copy: "Follow the manufacturer's instructions and confirm it can print a test page from the phone or computer before opening Dukarun.",
    },
    {
      title: 'Prepare one barcode',
      copy: 'Assign a unique barcode to an active product or service. Duplicate barcodes must be resolved before printing or selling.',
    },
    {
      title: 'Print the Dukarun test label',
      copy: 'Open Products → Print labels, choose Compact roll or A4 sheet, then select Print test label.',
    },
    {
      title: 'Match the system dialog',
      copy: 'Choose the same paper size, 100% scale, portrait orientation, and no extra margins or browser headers.',
    },
    {
      title: 'Scan the printed result',
      copy: 'Use POS → Sell and scan the test. Only continue when the full value reads reliably and the label is aligned.',
    },
    {
      title: 'Print the ready batch',
      copy: 'Print catalogue labels in manageable batches. Dukarun excludes missing or ambiguous codes from ready labels.',
    },
  ] as const;

  protected readonly troubleshooting = [
    {
      problem: 'The printer does not appear',
      fix: "Reconnect it in the device settings, install the manufacturer's driver or Android print service, and prove it can print outside Dukarun first.",
    },
    {
      problem: 'The label is shifted, clipped, or blank',
      fix: 'Match the driver media to 50 × 30 mm, print at 100%, disable fit-to-page and browser headers, and confirm portrait orientation.',
    },
    {
      problem: 'The printer skips labels',
      fix: "Calibrate the printer's gap or black-mark sensor using its hardware controls, then repeat the test label.",
    },
    {
      problem: 'The printed barcode will not scan',
      fix: 'Clean the print head, increase print density in the driver, keep 100% scale, and make sure the complete barcode is visible.',
    },
    {
      problem: 'A scan is unknown or ambiguous',
      fix: 'Confirm the barcode belongs to an active variant, preserve leading zeroes, and replace shared duplicate codes with individual barcodes.',
    },
  ] as const;
}
