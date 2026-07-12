import { describe, expect, it } from '@jest/globals';
import {
  renderBatchMessage,
  findUnknownTemplateVariables,
} from '../../../src/services/batch-messaging/batch-message-template.engine';

describe('renderBatchMessage', () => {
  it('replaces known variables', () => {
    const result = renderBatchMessage('Hi {{firstName}}, welcome to {{shopName}}!', {
      firstName: 'Jane',
      lastName: 'Doe',
      shopName: 'Mama Mboga',
      shopCode: 'mama-mboga',
    });

    expect(result).toBe('Hi Jane, welcome to Mama Mboga!');
  });

  it('leaves missing variables untouched', () => {
    const result = renderBatchMessage('Hi {{firstName}}, your code is {{shopCode}}', {
      firstName: 'John',
      shopName: 'Default',
      shopCode: 'default',
    });

    expect(result).toBe('Hi John, your code is default');
  });

  it('handles empty templates', () => {
    const result = renderBatchMessage('', {
      firstName: 'John',
      shopName: 'Default',
      shopCode: 'default',
    });

    expect(result).toBe('');
  });

  it('replaces multiple occurrences', () => {
    const result = renderBatchMessage('{{firstName}} {{firstName}}', {
      firstName: 'Anna',
      shopName: 'Default',
      shopCode: 'default',
    });

    expect(result).toBe('Anna Anna');
  });
});

describe('findUnknownTemplateVariables', () => {
  it('returns unknown variables', () => {
    expect(findUnknownTemplateVariables('Hi {{firstName}}, code {{foo}}')).toEqual(['foo']);
  });

  it('returns empty array when all variables are known', () => {
    expect(findUnknownTemplateVariables('Hi {{firstName}}, welcome to {{shopName}}')).toEqual([]);
  });

  it('deduplicates unknown variables', () => {
    expect(findUnknownTemplateVariables('{{bar}} and {{bar}}')).toEqual(['bar']);
  });
});
