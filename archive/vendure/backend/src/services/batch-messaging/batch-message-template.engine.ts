export interface BatchMessageTemplateContext {
  firstName: string;
  lastName?: string;
  shopName: string;
  shopCode: string;
}

const ALLOWED_VARIABLES = new Set(['firstName', 'lastName', 'shopName', 'shopCode']);

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Renders a batch message by replacing `{{firstName}}`, `{{shopName}}`, etc.
 * Missing variables are left as raw placeholders so the admin can spot them.
 */
export function renderBatchMessage(template: string, context: BatchMessageTemplateContext): string {
  return template.replace(VARIABLE_REGEX, (_match, key: string) => {
    const value = context[key as keyof BatchMessageTemplateContext];
    return value != null ? String(value) : `{{${key}}}`;
  });
}

/**
 * Returns any variables used in the template that are not in the allowed list.
 */
export function findUnknownTemplateVariables(template: string): string[] {
  const unknown = new Set<string>();
  let match: RegExpExecArray | null;
  VARIABLE_REGEX.lastIndex = 0;
  while ((match = VARIABLE_REGEX.exec(template)) !== null) {
    const key = match[1];
    if (!ALLOWED_VARIABLES.has(key)) {
      unknown.add(key);
    }
  }
  return Array.from(unknown);
}
