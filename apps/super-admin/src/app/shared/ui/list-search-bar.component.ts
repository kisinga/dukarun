import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-list-search-bar',
  imports: [ReactiveFormsModule, NgIcon],
  host: { class: 'mb-5 block' },
  template: `
    <section class="card flex flex-col gap-3 bg-base-100 p-3 sm:p-3.5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div class="relative min-w-0 lg:w-[24rem] lg:flex-none">
          <ng-icon
            name="heroMagnifyingGlass"
            class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base-content/40"
          />
          <input
            type="search"
            class="input input-bordered min-h-11 w-full pr-9 pl-9"
            [placeholder]="placeholder()"
            [formControl]="control()"
          />
          @if (control().value) {
            <button
              type="button"
              class="btn absolute top-1/2 right-1 btn-circle btn-ghost btn-sm -translate-y-1/2"
              aria-label="Clear search"
              (click)="control().setValue('')"
            >
              <ng-icon name="heroXMark" />
            </button>
          }
        </div>
        <div class="min-w-0 flex-1"><ng-content /></div>
      </div>
    </section>
  `,
})
export class ListSearchBarComponent {
  readonly control = input.required<FormControl<string>>();
  readonly placeholder = input('Search…');
}
