import { test as base } from '@playwright/test';

export { expect, type Locator, type Page } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, use) => {
    // These journeys mock the backend. The live guide SDK must not delay page
    // loading or send fictional test identities to the vendor.
    await context.route(/^https:\/\/(?:js|api)\.usertour\.io\//, route => route.abort());
    await use(context);
  },
});
