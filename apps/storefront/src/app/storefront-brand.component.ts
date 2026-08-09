import { Component, input, signal } from '@angular/core';

@Component({
  selector: 'app-storefront-brand',
  template: `
    <div class="store-mark" [class.store-mark--small]="compact()">
      @if (logoUrl() && !broken()) {
        <img [src]="logoUrl()" [alt]="(name() || 'Shop') + ' logo'" (error)="broken.set(true)" />
      } @else {
        <span aria-hidden="true">{{ initial() }}</span>
      }
    </div>
  `,
  styles: `
    .store-mark {
      display: grid;
      width: 4rem;
      height: 4rem;
      flex: none;
      place-items: center;
      overflow: hidden;
      border: 1px solid #e4ded5;
      border-radius: 1.25rem;
      background: #f7ded3;
      color: #a63f22;
      font-size: 1.4rem;
      font-weight: 700;
    }
    .store-mark--small {
      width: 3rem;
      height: 3rem;
      border-radius: 1rem;
      font-size: 1.1rem;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
})
export class StorefrontBrandComponent {
  readonly name = input.required<string | null>();
  readonly logoUrl = input<string | null>(null);
  readonly compact = input(false);
  protected readonly broken = signal(false);

  protected initial(): string {
    return this.name()?.trim().charAt(0).toUpperCase() || 'D';
  }
}
