export const extensionRoutes = [  {
    path: 'extensions/subscription-tiers',
    loadChildren: () => import('./extensions/1cbe795a69b76c0e44ca937c33de35ccff50ac598f5e95349cb3ed88af245f96/subscription-tier.module').then(m => m.SubscriptionTierModule),
  },
  {
    path: 'extensions/subscription-tiers',
    loadChildren: () => import('./extensions/1cbe795a69b76c0e44ca937c33de35ccff50ac598f5e95349cb3ed88af245f96/routes'),
  }];
