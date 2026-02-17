/// <reference types="jest" />
import { IMAGE_SIZE } from '../src/constants';

describe('ml-trainer smoke', () => {
  it('exports IMAGE_SIZE constant', () => {
    expect(IMAGE_SIZE).toBe(224);
  });
});
