import {
  type AcquisitionSource,
  type EnquiryIntent,
} from '../../../../../packages/public-acquisition';

export const ENQUIRY_OPTIONS = {
  locations: ['1', '2–3', '4+'],
  staff: ['Owner only', '1–3', '4–10', '11+'],
  need: [
    'Stock',
    'Cash and M-Pesa',
    'Customer credit',
    'Staff oversight',
    'Replacing a POS',
    'Other',
  ],
  records: ['Notebook', 'Spreadsheet', 'Existing POS', 'Other'],
  timing: ['As soon as possible', 'Within 30 days', 'Exploring'],
  assistance: [
    'Self-start',
    'Data preparation',
    'Staff training',
    'Both data preparation and training',
    'Unsure',
  ],
} as const;

export interface QualifiedEnquiry {
  businessType: string;
  locations: string;
  staff: string;
  need: string;
  records: string;
  timing: string;
  assistance: string;
}
export type EnquiryField = keyof QualifiedEnquiry;
export const EMPTY_ENQUIRY: QualifiedEnquiry = {
  businessType: '',
  locations: '',
  staff: '',
  need: '',
  records: '',
  timing: '',
  assistance: '',
};

export function enquiryErrors(input: QualifiedEnquiry): Partial<Record<EnquiryField, string>> {
  const errors: Partial<Record<EnquiryField, string>> = {};
  if (!input.businessType.trim()) errors.businessType = 'Enter your business type.';
  else if (input.businessType.trim().length > 80)
    errors.businessType = 'Use 80 characters or fewer.';
  for (const field of Object.keys(ENQUIRY_OPTIONS) as (keyof typeof ENQUIRY_OPTIONS)[]) {
    if (!(ENQUIRY_OPTIONS[field] as readonly string[]).includes(input[field]))
      errors[field] = 'Choose an option.';
  }
  return errors;
}

export function qualifiedEnquiryMessage(
  intent: EnquiryIntent,
  input: QualifiedEnquiry,
  source: AcquisitionSource
): string {
  const business = input.businessType
    .replace(/[\r\n\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, 80);
  return [
    intent === 'setup'
      ? 'Hello Dukarun, I would like a setup and staff training quote.'
      : 'Hello Dukarun, I would like a demo for my shop.',
    '',
    `Business type: ${business}`,
    `Locations: ${input.locations}`,
    `Staff: ${input.staff}`,
    `Main need: ${input.need}`,
    `Current records: ${input.records}`,
    `Intended start: ${input.timing}`,
    `Assistance needed: ${input.assistance}`,
    '',
    'Please confirm the current subscription and any separately quoted setup costs.',
    `Source: ${source.from}`,
    ...(source.utmSource ? [`Campaign source: ${source.utmSource}`] : []),
    ...(source.utmMedium ? [`Campaign medium: ${source.utmMedium}`] : []),
    ...(source.utmCampaign ? [`Campaign: ${source.utmCampaign}`] : []),
    ...(source.blogRef ? [`Blog reference: ${source.blogRef}`] : []),
  ].join('\n');
}
