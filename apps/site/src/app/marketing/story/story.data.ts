import type { StoryConfig } from './story.types';

/** Story relationships belong here; geometry is owned by the renderer. */
export const STORY_TREE_CONFIG: StoryConfig = {
  id: 'dukarun',
  title: 'Customer experiences feeding shared directions',
  branches: [
    {
      id: 'builder',
      label: 'Room to change',
      color: '#e85d2f',
      nodes: [
        {
          id: 'builder-1',
          persona: 'The builder',
        },
        {
          id: 'builder-2',
          persona: 'The builder',
        },
        {
          id: 'builder-3',
          persona: 'The builder',
        },
        {
          id: 'builder-4',
          persona: 'The builder',
        },
      ],
    },
    {
      id: 'owner',
      label: 'Daily confidence',
      color: '#5a5a5a',
      nodes: [
        {
          id: 'owner-1',
          persona: 'The shop owner',
        },
        {
          id: 'owner-2',
          persona: 'The shop owner',
        },
        {
          id: 'owner-3',
          persona: 'The shop owner',
        },
        {
          id: 'owner-4',
          persona: 'The shop owner',
        },
      ],
    },
    {
      id: 'cashier',
      label: 'Reliable offline',
      color: '#3b82f6',
      nodes: [
        {
          id: 'cashier-1',
          persona: 'The cashier',
        },
        {
          id: 'cashier-2',
          persona: 'The cashier',
        },
        {
          id: 'cashier-3',
          persona: 'The cashier',
        },
        {
          id: 'cashier-4',
          persona: 'The cashier',
        },
      ],
    },
    {
      id: 'stock',
      label: 'Stock reality',
      color: '#a97416',
      nodes: [
        {
          id: 'stock-1',
          persona: 'The stock keeper',
        },
        {
          id: 'stock-2',
          persona: 'The stock keeper',
        },
        {
          id: 'stock-3',
          persona: 'The stock keeper',
        },
        {
          id: 'stock-4',
          persona: 'The stock keeper',
        },
      ],
    },
    {
      id: 'customer',
      label: 'Beyond the counter',
      color: '#168348',
      nodes: [
        {
          id: 'customer-1',
          persona: 'The customer',
        },
        {
          id: 'customer-2',
          persona: 'The customer',
        },
        {
          id: 'customer-3',
          persona: 'The customer',
        },
        {
          id: 'customer-4',
          persona: 'The customer',
        },
      ],
    },
  ],
  lessons: [
    {
      text: 'Trust the record',
      chapter: 'money-record',
      detail: 'The record has to agree with the work.',
    },
    {
      text: 'Clear ownership',
      chapter: 'direct-payments',
      detail: 'The money belongs with the merchant.',
    },
    {
      text: 'Keep serving people',
      chapter: 'a-sale-cannot-wait',
      detail: 'The connection must not decide whether a shop can serve a customer.',
    },
    {
      text: 'Fit the real work',
      chapter: 'real-units',
      detail: 'The model must adapt to the shop.',
    },
    {
      text: 'Keep listening',
      chapter: 'first-businesses',
      detail: 'Each customer experience can reshape the answer.',
    },
  ],
  chapters: [
    {
      id: 'a-sale-cannot-wait',
      leaf: 'cashier-1',
      branch: 'cashier',
      date: 'A customer’s experience',
      persona: 'A customer with unreliable internet',
      title: 'A customer is waiting. The screen is frozen.',
      intro: 'The connection drops at exactly the wrong moment.',
      quote:
        'My internet is unreliable. Sometimes the system freezes when I need to make a sale. This makes it hard to use in my shop.',
      body: 'They were trying to serve a customer, but a sale depended on a connection they could not rely on. I went there and experienced the problem myself. I was not happy with what I saw. Offline stopped being only something I intended to build; it became a problem I had watched interrupt someone’s work.',
      direction: 'A customer should be able to keep serving people when the signal disappears.',
      context:
        'The encounter is recounted by the founder. Add the customer’s name or chosen persona, the visit date, and the details they want to share. No date has been inferred from the code.',
      basis:
        'Customer account supplied by the founder; the wording above is an edited retelling, not a transcript. PR #325 corroborates the later implementation of an offline sales queue, not the date or details of this visit.',
      sources: [
        {
          label: 'PR #325 · later offline sales implementation',
          url: 'https://github.com/kisinga/dukarun/pull/325',
        },
      ],
      related: [
        'an-idea-before-a-visit',
        'the-work-i-resisted',
        'freedom-to-rebuild',
        'more-than-a-sales-record',
      ],
    },
    {
      id: 'an-idea-before-a-visit',
      leaf: 'cashier-2',
      branch: 'cashier',
      date: 'An earlier intention',
      persona: 'The founder · the original design intention',
      title: 'The intention was there before it was grounded.',
      intro: 'I had always thought working offline mattered.',
      body: 'There was already effort behind that intention. But being able to describe an offline design was different from seeing a customer lose the ability to make a sale. Their experience gave the idea a firmer direction: the ordinary work of the shop needed to carry on, not just the screen look ready.',
      direction:
        'An early idea becomes meaningful when it answers an experience someone actually has.',
      context:
        'Connect the first design discussions, earlier attempts, and the visit here. Their dates may overlap; this leaf is linked by what it contributed, not where it sits on a timeline.',
      basis:
        'Founder’s account of the original intention. The technical record includes an offline-first POS implementation on 12 October 2025 within PR #39, and broader pre-Supabase caching changes in PR #187 on 17 February 2026.',
      sources: [
        {
          label: 'PR #39 · early offline-first work',
          url: 'https://github.com/kisinga/dukarun/pull/39',
        },
        {
          label: '12 October 2025 · offline-first POS implementation',
          url: 'https://github.com/kisinga/dukarun/commit/d46eb9ed',
        },
        {
          label: 'PR #187 · pre-Supabase caching revision',
          url: 'https://github.com/kisinga/dukarun/pull/187',
        },
      ],
      related: ['a-sale-cannot-wait', 'the-work-i-resisted', 'more-than-a-sales-record'],
    },
    {
      id: 'the-work-i-resisted',
      leaf: 'builder-2',
      branch: 'builder',
      date: 'The founder’s friction',
      persona: 'The founder · listening while facing the work',
      title: 'I could see the need. I could also see the work.',
      intro: 'The implementation was not immediate.',
      body: 'Making that experience reliable meant a lot more work on my side. I felt friction because I could see how much had to change. I was trying to get the old GraphQL-based system to give me the caching behavior I needed, and it was not enough for the experience I wanted. Hearing the problem did not make the engineering cost disappear.',
      direction: 'Take the customer’s problem seriously, including the work it demands from us.',
      context:
        'Add the particular tradeoff, the attempted fixes, and what made it difficult to commit to the change.',
      basis:
        'Friction and the limits of the earlier stack are the founder’s account. PR #187 records earlier application-wide caching attempts, including storage adapters and server hydration; it does not establish the date of this customer encounter.',
      sources: [
        {
          label: 'PR #187 · earlier attempts to improve caching',
          url: 'https://github.com/kisinga/dukarun/pull/187',
        },
      ],
      related: ['a-sale-cannot-wait', 'an-idea-before-a-visit', 'freedom-to-rebuild'],
    },
    {
      id: 'freedom-to-rebuild',
      leaf: 'builder-3',
      branch: 'builder',
      date: 'An enabling change',
      persona: 'The founder · changing the foundation',
      title: 'A different foundation made room for the answer.',
      intro: 'Moving to Supabase gave me more freedom to build it properly.',
      body: 'The move created room for a stronger caching system and a durable way to keep sales on the device until they could be posted. This was an enabler for a direction the customer had already grounded. It was not the moment the need first appeared, and it was not the end of the work.',
      direction: 'Change the foundation when it gives us room to answer the real problem.',
      context:
        'What freedom did the new foundation give you? Which constraints did it remove, and which remained?',
      basis:
        'Founder’s account of the architectural motivation. PR #325 merged on 6 August 2026 and contains the offline sales queue, IndexedDB outbox, catalog snapshot, cart persistence, and exactly-once replay work.',
      sources: [
        {
          label: 'PR #325 · Supabase move and offline queue',
          url: 'https://github.com/kisinga/dukarun/pull/325',
        },
        {
          label: 'Offline queue, catalog snapshot, and persisted cart',
          url: 'https://github.com/kisinga/dukarun/commit/4cddd822',
        },
      ],
      related: [
        'a-sale-cannot-wait',
        'the-work-i-resisted',
        'more-than-a-sales-record',
        'safe-to-return',
      ],
    },
    {
      id: 'more-than-a-sales-record',
      leaf: 'cashier-3',
      branch: 'cashier',
      date: 'The direction expands',
      persona: 'The customer at the counter · the founder responding',
      title: 'Saving a sale was only part of the answer.',
      intro: 'A sale needs the rest of the shop to be available too.',
      body: 'Recording an offline sale is not enough if the products, prices, people, or other work needed to make it are still waiting on the network. That pushed the response toward a caching system that could be adapted across the product. The ambition became an experience that feels ready: quick navigation, immediate interaction, and work that survives an unreliable connection.',
      direction: 'Carry the lesson beyond one feature, into how the whole system responds.',
      context:
        'Add the next customer experience that widened this direction. Where did the system still feel slow or dependent on a connection?',
      basis:
        'The wider ambition is supplied by the founder. PR #330 added durable journal sync and cached consumers across the app in August 2026. PR #403 added reusable cache-backed identity lookups in September 2026. These corroborate the widening implementation; they are not claims that every part of the app is fully offline.',
      sources: [
        {
          label: 'PR #330 · durable journal sync across the app',
          url: 'https://github.com/kisinga/dukarun/pull/330',
        },
        {
          label: 'Durable journal sync and cached consumers',
          url: 'https://github.com/kisinga/dukarun/commit/0f810d3a',
        },
        {
          label: 'PR #403 · reusable cache-backed lookups',
          url: 'https://github.com/kisinga/dukarun/pull/403',
        },
      ],
      related: [
        'a-sale-cannot-wait',
        'an-idea-before-a-visit',
        'freedom-to-rebuild',
        'safe-to-return',
      ],
    },
    {
      id: 'safe-to-return',
      leaf: 'cashier-4',
      branch: 'cashier',
      date: 'A continuing responsibility',
      persona: 'The cashier · the person responsible for the money',
      title: 'Coming back online needs care too.',
      intro: 'The work must survive the return, as well as the outage.',
      body: 'Once a sale can happen without a connection, a different question follows: what happens when it returns? A repeated request, changed product, or closed cashier session must not quietly turn into a second sale or a misleading cash record. The implementation kept developing around custody, review, and an explicit path back into the business record.',
      direction: 'Make recovery accountable to the people who took the sale and handled the money.',
      context:
        'The specific customer encounter behind this refinement is still to collect. Connect it here when it is known.',
      basis:
        'Technical refinement documented by PR #406, merged 30 September 2026. This is not presented as an observed customer incident or as the origin of offline selling.',
      sources: [
        {
          label: 'PR #406 · tighter offline sync and review',
          url: 'https://github.com/kisinga/dukarun/pull/406',
        },
        {
          label: 'Offline posting and recovery record',
          url: 'https://github.com/kisinga/dukarun/blob/98f8d9e8/docs/OFFLINE_POSTING_CUTOVER.md',
        },
      ],
      related: ['a-sale-cannot-wait', 'more-than-a-sales-record', 'money-record'],
    },
    {
      id: 'money-record',
      leaf: 'owner-1',
      branch: 'owner',
      date: 'A direction in the record',
      persona: 'The shop owner',
      title: 'The record needs to stand up to a real day.',
      intro: 'At closing time, the numbers should make sense.',
      body: 'Cash in the drawer, M-Pesa receipts, money owed, and stock sold all belong to the same day. Dukarun connects that work to one financial record, with balanced entries and traceable posting. The implementation is documented; the individual customer encounter behind this direction is still being collected.',
      direction: 'Give the owner a record they can explain and reconcile.',
      context: 'Whose daily close exposed a gap? What was missing or difficult to explain?',
      basis: 'Documented ledger finalization; customer encounter pending.',
      sources: [
        {
          label: 'Ledger finalization and concurrency checks',
          url: 'https://github.com/kisinga/dukarun/commit/002da0da',
        },
        {
          label: 'Architecture and the business record',
          url: 'https://github.com/kisinga/dukarun/blob/98f8d9e8/ARCHITECTURE.md',
        },
      ],
      related: ['safe-to-return', 'direct-payments', 'first-businesses'],
    },
    {
      id: 'direct-payments',
      leaf: 'owner-2',
      branch: 'owner',
      date: 'A direction in the record',
      persona: 'The merchant',
      title: 'The money belongs with the merchant.',
      intro: 'A payment request is not the same as money received.',
      body: 'A shop owner needs to know where the money went and whether it actually arrived. Dukarun’s M-Pesa integration sends funds directly to the merchant and reconciles the collection. This principle is in the implementation record. We are still documenting the customer conversations that shaped it.',
      direction: 'Keep ownership of money and evidence of payment explicit.',
      context: 'Which merchant’s payment experience changed this direction?',
      basis: 'Integration documentation; the motivating customer encounter is not yet supplied.',
      sources: [
        {
          label: 'M-PESA integration and merchant ownership',
          url: 'https://github.com/kisinga/dukarun/blob/98f8d9e8/docs/MPESA_INTEGRATION.md',
        },
      ],
      related: ['money-record', 'safe-to-return'],
    },
    {
      id: 'real-units',
      leaf: 'stock-2',
      branch: 'stock',
      date: 'A direction in the record',
      persona: 'The person keeping stock',
      title: 'The shop sells real quantities, not tidy assumptions.',
      intro: 'A packet, part of a pack, or a quantity weighed at the counter.',
      body: 'The unit that makes sense in a database is not always the one used in a shop. Dukarun was extended to support fractional base units alongside active packs, so the product model can fit the way stock is handled. The technical change is traceable. Its motivating customer story is still being documented.',
      direction: 'Let the model fit the way a business handles its stock.',
      context: 'Which actual product was hard to represent? Who was working around the old rule?',
      basis: 'Documented capability; real-world encounter pending.',
      sources: [
        {
          label: 'Fractional units alongside packs',
          url: 'https://github.com/kisinga/dukarun/commit/efea39ae',
        },
      ],
      related: ['more-than-a-sales-record', 'first-businesses'],
    },
    {
      id: 'beyond-counter',
      leaf: 'customer-4',
      branch: 'customer',
      date: 'A direction in the record',
      persona: 'The customer and shop owner',
      title: 'A shop can reach beyond its counter.',
      intro: 'Let customers find what the shop has, before they arrive.',
      body: 'A shop does not have to be discovered only by walking past it. Storefront publication gives a merchant a customer-facing place to show what they sell. The feature is in the repository; the first merchant and customer experiences behind this branch are still being collected.',
      direction: 'Give the business a customer-facing place of its own.',
      context: 'Who asked for this? What were customers doing before they could find the catalog?',
      basis: 'Documented publication feature; motivating customer account pending.',
      sources: [
        {
          label: 'Storefront publication',
          url: 'https://github.com/kisinga/dukarun/commit/6e907d13',
        },
      ],
      related: ['real-units', 'first-businesses'],
    },
    {
      id: 'first-businesses',
      leaf: 'owner-4',
      branch: 'owner',
      date: 'A direction still being tested',
      persona: 'The first owner-led businesses',
      title: 'Usefulness is something we have to learn.',
      intro: 'A completed business day is a better question than a registration count.',
      body: 'The route-to-market plan focuses on owner-led shops and one useful business cycle. Its goals are not completed outcomes. The next leaves belong to the people who try Dukarun, the work they manage to complete, and the problems that tell us what to change.',
      direction: 'Learn from real use, support needs, and whether people keep coming back.',
      context:
        'Add each business’s distinct experience. Let a new story add a small branch rather than replacing the others.',
      basis: 'Documented plan; first-person accounts and outcomes pending.',
      sources: [
        {
          label: 'First ten businesses · learning plan',
          url: 'https://github.com/kisinga/dukarun/blob/98f8d9e8/docs/ROUTE_TO_MARKET_FIRST_10.md',
        },
      ],
      related: ['a-sale-cannot-wait', 'real-units', 'beyond-counter', 'money-record'],
    },
  ],
  openLabels: {
    'builder-1': 'An idea that challenged our answer',
    'builder-4': 'A customer request still to tell',
    'owner-3': 'A day that did not balance',
    'stock-1': 'A stock count that changed a rule',
    'stock-3': 'A product that challenged the model',
    'stock-4': 'Another way the shop handles stock',
    'customer-1': 'A customer trying to find a product',
    'customer-2': 'The receipt after a sale',
    'customer-3': 'A new way to reach the shop',
  },
};
