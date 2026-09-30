import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { documentHtml, type RenderedDocument } from '@dukarun/documents';

/** Script-disabled frame gives customer documents the same content and styles as printing. */
@Component({
  selector: 'app-document-view',
  host: { '(window:resize)': 'resize()' },
  template: `<iframe
    #frame
    title="Business document"
    sandbox="allow-same-origin allow-modals"
    [srcdoc]="source()"
    (load)="resize()"
  ></iframe>`,
  styles: `
    iframe {
      display: block;
      width: 100%;
      min-height: 24rem;
      border: 0;
      background: white;
    }
  `,
})
export class DocumentViewComponent {
  readonly document = input.required<RenderedDocument>();
  private readonly sanitizer = inject(DomSanitizer);
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  readonly source = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(documentHtml(this.document()))
  );
  resize(): void {
    const frame = this.frame().nativeElement;
    const doc = frame.contentDocument;
    const content = doc?.querySelector<HTMLElement>('.document');
    if (!doc || !content) return;
    doc.documentElement.style.setProperty(
      '--document-preview-scale',
      String(Math.min(1, frame.clientWidth / content.scrollWidth))
    );
    frame.style.height = `${doc.body.scrollHeight + 24}px`;
  }
  async print(): Promise<void> {
    const frame = this.frame().nativeElement;
    const win = frame.contentWindow;
    if (!win) throw new Error('The document is not ready. Try again.');
    if (win.document.readyState !== 'complete')
      await new Promise<void>(resolve => {
        frame.addEventListener('load', () => resolve(), { once: true });
        setTimeout(resolve, 2000);
      });
    await Promise.race([
      Promise.all([
        win.document.fonts?.ready,
        ...Array.from(win.document.images)
          .filter(i => !i.complete)
          .map(
            i =>
              new Promise<void>(resolve => {
                i.addEventListener('load', () => resolve(), { once: true });
                i.addEventListener('error', () => resolve(), { once: true });
              })
          ),
      ]),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    win.focus();
    win.print();
  }
}
