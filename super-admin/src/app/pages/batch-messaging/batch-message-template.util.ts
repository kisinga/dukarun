/**
 * Client-side mirror of backend/src/services/batch-messaging/batch-message-template.engine.ts.
 * Keep in sync with the backend implementation.
 */
export interface BatchMessageTemplateContext {
  firstName: string;
  lastName?: string;
  shopName: string;
  shopCode: string;
}

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

export function renderBatchMessage(
  template: string,
  context: BatchMessageTemplateContext
): string {
  return template.replace(VARIABLE_REGEX, (_match, key: string) => {
    const value = context[key as keyof BatchMessageTemplateContext];
    return value != null ? String(value) : `{{${key}}}`;
  });
}
