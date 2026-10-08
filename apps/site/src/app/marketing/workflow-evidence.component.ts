import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AcquisitionService } from '../core/acquisition.service';
import { DEMO_SHOP } from '../../../../../packages/marketing-demo';

@Component({
  selector: 'app-workflow-evidence',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-base-200/55 py-14 sm:py-20" aria-labelledby="workflow-heading">
      <div class="mkt-container">
        <div class="max-w-2xl">
          <span class="mkt-eyebrow">Inside Dukarun</span>
          <h2 id="workflow-heading" class="mkt-h2 mt-3">
            A sale, a clear balance, a checked closing.
          </h2>
          <p class="mkt-lead mt-4">
            Actual application screens using fictional {{ demoShop.name }} records. See a counter
            sale, a regular electrician customer's balance and a separate day's closing review.
          </p>
        </div>
        <div class="mt-9 grid gap-6 lg:grid-cols-3">
          @for (workflow of workflows; track workflow.image; let index = $index) {
            <figure class="mkt-card min-w-0 overflow-hidden">
              <a
                [href]="workflow.image"
                target="_blank"
                rel="noopener noreferrer"
                class="block bg-base-200"
                [attr.aria-label]="'Enlarge ' + workflow.title"
              >
                <img
                  [src]="workflow.image"
                  [alt]="workflow.alt"
                  width="1440"
                  height="1080"
                  loading="lazy"
                  decoding="async"
                  class="aspect-[4/3] w-full object-contain"
                />
              </a>
              <figcaption class="p-5 sm:p-6">
                <p class="mkt-eyebrow">{{ index + 1 }} · Example workflow</p>
                <h3 class="mt-2 text-lg font-semibold">{{ workflow.title }}</h3>
                <p class="mt-3 mb-0 text-sm leading-relaxed text-base-content/75">
                  {{ workflow.copy }}
                </p>
                <a
                  [routerLink]="workflow.guide"
                  class="link link-primary mt-4 inline-flex min-h-11 items-center text-sm font-semibold"
                  >{{ workflow.link }}</a
                >
              </figcaption>
            </figure>
          }
        </div>
        <a [href]="acquisition.enquiryUrl()" class="btn btn-primary mt-8 min-h-12"
          >Show me the workflow for my shop</a
        >
      </div>
    </section>
  `,
})
export class WorkflowEvidenceComponent {
  protected readonly acquisition = inject(AcquisitionService);
  protected readonly demoShop = DEMO_SHOP;
  protected readonly workflows = [
    {
      image: '/assets/workflows/record-sale.webp',
      title: 'Record the sale',
      alt: 'Dukarun POS at fictional Mwangaza Electricals, with four LED bulbs and two double sockets in a KES 1,900 sale.',
      copy: 'Four 9 W bulbs and two 13 A double sockets total KES 1,900. Check the item, unit and available quantity before recording payment and reducing stock.',
      guide: '/blog/choosing-pos-software-kenya',
      link: 'Use the demo checklist',
    },
    {
      image: '/assets/workflows/customer-credit.webp',
      title: 'Review what is owed',
      alt: 'Dukarun customer list at fictional Mwangaza Electricals: Amina Hassan owes KES 1,500, with credit approved and ten days outstanding.',
      copy: 'Amina Hassan, a regular electrician customer, owes KES 1,500 from an earlier purchase, outstanding for ten days. Review the balance before the next repayment.',
      guide: '/blog/how-to-know-shop-profit-kenya',
      link: 'Separate sales, profit and cash',
    },
    {
      image: '/assets/workflows/check-closing.webp',
      title: 'Check the closing record',
      alt: 'Dukarun cashier closing review at fictional Mwangaza Electricals: expected cash KES 6,500 and declared cash KES 6,400.',
      copy: 'On a separate example day, expected cash is KES 6,500 and the count is KES 6,400. Review the KES 100 difference before confirming the closing.',
      guide: '/blog/how-to-reconcile-cash-mpesa-shop',
      link: 'Follow the closing guide',
    },
  ];
}
