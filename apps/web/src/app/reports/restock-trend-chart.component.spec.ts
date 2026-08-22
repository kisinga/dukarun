import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RestockTrendChartComponent } from './restock-trend-chart.component';

describe('RestockTrendChartComponent', () => {
  it('labels the peak across both comparison periods', async () => {
    await TestBed.configureTestingModule({
      imports: [RestockTrendChartComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(RestockTrendChartComponent);
    fixture.componentRef.setInput('points', [
      {
        day: '2026-08-22',
        currentQuantity: 4,
        previousQuantity: 12,
        currentRevenue: 4_000,
        previousRevenue: 12_000,
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('12 peak');
  });
});
