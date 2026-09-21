import type { Locator } from '@playwright/test';

/** Measure rendered sRGB, including CSS colour mixtures and ancestor backgrounds. */
export async function renderedTextContrast(locator: Locator) {
  return locator.evaluate(async element => {
    await Promise.all(
      element.getAnimations().map(animation => animation.finished.catch(() => undefined))
    );
    const context = document.createElement('canvas').getContext('2d')!;
    const luminance = (rgb: number[]) =>
      rgb
        .slice(0, 3)
        .map(channel => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ancestors: Element[] = [];
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      ancestors.unshift(parent);
    }
    for (const ancestor of ancestors) {
      context.fillStyle = getComputedStyle(ancestor).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    const background = [...context.getImageData(0, 0, 1, 1).data];
    const style = getComputedStyle(element);
    context.fillStyle = style.color;
    context.fillRect(0, 0, 1, 1);
    const foreground = [...context.getImageData(0, 0, 1, 1).data];
    const a = luminance(foreground);
    const b = luminance(background);
    const fontSize = parseFloat(style.fontSize);
    const fontWeight = parseInt(style.fontWeight, 10);
    return {
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      foreground: foreground.slice(0, 3),
      background: background.slice(0, 3),
      fontSize,
      fontWeight,
    };
  });
}
