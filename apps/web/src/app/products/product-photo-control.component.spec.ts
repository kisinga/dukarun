import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconComponent } from '../shared/ui/icon.component';
import { ProductPhotoControlComponent } from './product-photo-control.component';

describe('ProductPhotoControlComponent', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalCreateObjectURL = URL.createObjectURL;

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: originalGetContext,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: originalToBlob,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
  });

  async function render(mode: 'create' | 'edit' = 'create') {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 100, height: 60, close: vi.fn() }))
    );
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({ drawImage: vi.fn() })),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: vi.fn((callback: BlobCallback, type?: string) => {
        callback(new Blob(['resized'], { type: type ?? 'image/jpeg' }));
      }),
    });
    const createObjectUrl = vi.fn(() => 'blob:preview');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });

    await TestBed.configureTestingModule({
      imports: [ProductPhotoControlComponent],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(ProductPhotoControlComponent);
    const selected = vi.fn();
    const failed = vi.fn();
    const remove = vi.fn();
    fixture.componentInstance.imageSelected.subscribe(selected);
    fixture.componentInstance.selectionFailed.subscribe(failed);
    fixture.componentInstance.removePhoto.subscribe(remove);
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('alt', 'Widget photo');
    fixture.detectChanges();
    return { fixture, selected, failed, remove, createObjectUrl };
  }

  it('resizes and emits a pending product image from a selected file', async () => {
    const { fixture, selected, failed, createObjectUrl } = await render();
    const file = new File(['photo'], 'photo.png', { type: 'image/png' });

    await (fixture.componentInstance as any).selectPhoto({
      target: { files: [file], value: 'photo.png' },
    });

    expect(failed).not.toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledWith({
      blob: expect.any(Blob),
      extension: 'png',
      previewUrl: 'blob:preview',
    });
  });

  it('emits a friendly error for non-image files', async () => {
    const { fixture, selected, failed } = await render();
    const file = new File(['csv'], 'products.csv', { type: 'text/csv' });

    await (fixture.componentInstance as any).selectPhoto({
      target: { files: [file], value: 'products.csv' },
    });

    expect(selected).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith('Choose a valid image file.');
  });

  it('makes a staged replacement explicit and allows it to be cancelled', async () => {
    const { fixture, remove } = await render('edit');
    fixture.componentRef.setInput('previewUrl', 'blob:new-preview');
    fixture.componentRef.setInput('pending', true);
    fixture.componentRef.setInput('hasStoredPhoto', true);
    fixture.detectChanges();

    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    expect(fixture.nativeElement.textContent).toContain(
      'The current photo stays in place until you save.'
    );
    expect(fixture.nativeElement.textContent).toContain('Replace photo');
    buttons.find(button => button.textContent?.includes('Cancel new photo'))?.click();

    expect(remove).toHaveBeenCalledOnce();
  });

  it('offers an undo while a stored photo is marked for removal', async () => {
    const { fixture, remove } = await render('edit');
    fixture.componentRef.setInput('hasStoredPhoto', true);
    fixture.componentRef.setInput('removalPending', true);
    fixture.detectChanges();

    const undo = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      button => button.textContent?.includes('Undo removal')
    );
    expect(fixture.nativeElement.textContent).toContain(
      'The current photo will be removed when you save.'
    );
    undo?.click();
    expect(remove).toHaveBeenCalledOnce();
  });
});
