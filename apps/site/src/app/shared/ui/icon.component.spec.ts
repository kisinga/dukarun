import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  it('renders the accessible WhatsApp mark without external icon setup', async () => {
    await TestBed.configureTestingModule({ imports: [IconComponent] }).compileComponents();
    const fixture: ComponentFixture<IconComponent> = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'whatsapp');
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();

    const mark = fixture.nativeElement.querySelector('.whatsapp-mark') as HTMLElement;
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.style.width).toBe('1.25rem');
  });
});
