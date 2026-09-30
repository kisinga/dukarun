import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { RenderedDocument } from '@dukarun/documents';

export type PreviewSection = 'identity' | 'message' | 'custom' | 'totals' | null;

@Component({
  selector: 'app-document-preview',
  host: { '(window:resize)': 'resize()' },
  template: `<iframe
    #frame
    title="Document preview"
    sandbox="allow-same-origin"
    [srcdoc]="source"
    class="w-full rounded-field border border-base-300"
    (load)="loaded()"
  ></iframe>`,
  styles: `
    iframe {
      display: block;
      min-height: 12rem;
      background: white;
    }
  `,
})
export class DocumentPreviewComponent {
  readonly document = input.required<RenderedDocument>();
  readonly activeSection = input<PreviewSection>(null);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly ready = signal(false);
  private observer?: ResizeObserver;
  // This skeleton never changes: only escaped renderer output enters the script-disabled frame.
  readonly source = inject(DomSanitizer).bypassSecurityTrustHtml(`<!doctype html><html><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style id="document-styles"></style><style>
    @media screen { body { padding:12px!important; }
      [data-preview-active] { outline:2px solid #ea580c; outline-offset:4px; min-height:1.4em; }
      .qr-pending { padding:12px; border:1px dashed #999; min-height:80px; } }
    @media print { [data-preview-active] { outline:none; } }
    </style></head><body></body></html>`);

  constructor() {
    effect(() => {
      const rendered = this.document();
      if (this.ready()) this.update(rendered);
    });
    effect(() => {
      const section = this.activeSection();
      if (this.ready()) this.highlight(section, true);
    });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  loaded(): void {
    this.ready.set(true);
    const frame = this.frame()?.nativeElement;
    if (frame && typeof ResizeObserver !== 'undefined') {
      this.observer?.disconnect();
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(frame);
    }
    frame?.contentDocument?.addEventListener('load', () => this.resize(), true);
    this.update(this.document());
  }

  private update(rendered: RenderedDocument): void {
    const doc = this.frame()?.nativeElement.contentDocument;
    if (!doc) return;
    doc.title = rendered.title;
    const style = doc.getElementById('document-styles');
    if (style && style.textContent !== rendered.styles) style.textContent = rendered.styles;
    const template = doc.createElement('template');
    template.innerHTML = rendered.html;
    this.patchChildren(doc.body, template.content);
    this.highlight(this.activeSection(), false);
    this.resize();
  }

  /** Preserve unchanged DOM (including loaded images and QR SVG) across keystrokes. */
  private patchChildren(current: Node, next: Node): void {
    const incoming = Array.from(next.childNodes);
    incoming.forEach((node, index) => {
      const existing = current.childNodes[index];
      if (!existing) {
        current.appendChild(node.cloneNode(true));
        return;
      }
      if (existing.nodeType !== node.nodeType || existing.nodeName !== node.nodeName) {
        current.replaceChild(node.cloneNode(true), existing);
        return;
      }
      if (node.nodeType === 1) {
        const a = existing as Element;
        const b = node as Element;
        for (const attr of Array.from(a.attributes))
          if (!b.hasAttribute(attr.name) && attr.name !== 'data-preview-active')
            a.removeAttribute(attr.name);
        for (const attr of Array.from(b.attributes))
          if (a.getAttribute(attr.name) !== attr.value) a.setAttribute(attr.name, attr.value);
        this.patchChildren(a, b);
      } else if (existing.nodeValue !== node.nodeValue) existing.nodeValue = node.nodeValue;
    });
    while (current.childNodes.length > incoming.length) current.lastChild?.remove();
  }

  private highlight(section: PreviewSection, reveal: boolean): void {
    const doc = this.frame()?.nativeElement.contentDocument;
    doc
      ?.querySelectorAll('[data-preview-active]')
      .forEach(el => el.removeAttribute('data-preview-active'));
    if (!section) return;
    const target = doc?.querySelector<HTMLElement>(`[data-preview-section="${section}"]`);
    target?.setAttribute('data-preview-active', '');
    // Scroll only on a new field focus, never when its text changes.
    if (reveal && target) {
      const frame = this.frame()?.nativeElement;
      const viewport = frame?.closest('.preview-scroll');
      if (frame && viewport && viewport.scrollHeight > viewport.clientHeight) {
        const bounds = viewport.getBoundingClientRect();
        const top = frame.getBoundingClientRect().top + target.getBoundingClientRect().top;
        const bottom = top + target.getBoundingClientRect().height;
        if (top < bounds.top) viewport.scrollTop += top - bounds.top - 8;
        else if (bottom > bounds.bottom) viewport.scrollTop += bottom - bounds.bottom + 8;
      }
    }
  }

  resize(): void {
    const frame = this.frame()?.nativeElement;
    const doc = frame?.contentDocument;
    const content = doc?.querySelector<HTMLElement>('.document');
    if (!frame || !doc || !content || frame.clientWidth === 0) return;
    const scale = Math.min(1, Math.max(0, frame.clientWidth - 24) / content.offsetWidth);
    if (!Number.isFinite(scale) || scale <= 0) return;
    doc.documentElement.style.setProperty('--document-preview-scale', String(scale));
    const height = `${Math.ceil(content.getBoundingClientRect().height + 24)}px`;
    if (frame.style.height !== height) frame.style.height = height;
  }
}
