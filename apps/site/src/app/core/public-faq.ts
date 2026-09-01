export interface PublicFaq {
  readonly question: string;
  readonly answer: string;
}

/** Shared by the visible homepage FAQ and its structured search metadata. */
export const PUBLIC_FAQS: readonly PublicFaq[] = [
  {
    question: 'Can I start without paying for staff training?',
    answer:
      'Yes. A simple owner-run shop can start with a 30-minute orientation, five products or services, and the self-help guides. Paid implementation is not required for every customer.',
  },
  {
    question: 'When is paid implementation necessary?',
    answer:
      'Consider it when you need existing stock or records prepared, several employees trained, multiple locations configured, or a business process mapped before go-live. We scope and quote that work separately; typical engagements exceed KES 40,000.',
  },
  {
    question: 'What does the subscription include?',
    answer:
      'The subscription pays for continued access to the system and the limits and capabilities listed in your chosen plan. Data preparation, workflow setup and staff training are separate only when your business needs them.',
  },
  {
    question: 'What happens when my internet drops?',
    answer:
      'Nothing changes at the counter. The POS keeps selling and queues every sale on the device, then syncs when the network returns. Safeguards make sure no sale is ever posted twice.',
  },
  {
    question: 'Do I need special hardware?',
    answer:
      'No. Dukarun runs on the Android phone you already have, and on any desktop browser for the back office. For paper receipts, use a Bluetooth or USB printer that is available through your device’s normal print service and supports 52 mm or 80 mm paper.',
  },
  {
    question: 'Can customers pay straight into Dukarun by M-Pesa?',
    answer:
      'Yes, when M-Pesa is configured and active for the shop location, Dukarun can send an STK prompt and confirm the payment. A shop can also record a verified M-Pesa receipt when manual confirmation is enabled.',
  },
  {
    question: 'Can my staff use it without seeing everything?',
    answer:
      'Yes. Cashiers sell; managers approve; owners see the books. Roles decide what each person can do, and sensitive actions like price overrides or stock adjustments can require approval.',
  },
  {
    question: 'How is the subscription billed?',
    answer:
      'Monthly or yearly, through M-Pesa. You get a prompt on your phone, approve it, and you are done.',
  },
];
