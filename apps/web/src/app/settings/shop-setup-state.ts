import type { CompanySettings } from './settings.service';
export type SetupTaskStatus = 'done' | 'optional' | 'attention';
export function shopSetupTasks(
  settings: CompanySettings
): { key: string; label: string; status: SetupTaskStatus }[] {
  return [
    {
      key: 'identity',
      label: 'Shop identity',
      status: settings.name.trim() && settings.shop_setup?.identity_reviewed ? 'done' : 'attention',
    },
    { key: 'logo', label: 'Logo (optional)', status: settings.logo_path ? 'done' : 'optional' },
    {
      key: 'address',
      label: 'Shop web address',
      status: settings.public_slug
        ? 'done'
        : settings.shop_setup?.address_deferred
          ? 'optional'
          : 'attention',
    },
    {
      key: 'documents',
      label: 'Document preview',
      status: settings.shop_setup?.documents_reviewed ? 'done' : 'attention',
    },
  ];
}
export function nextShopSetupStep(settings: CompanySettings): number {
  const tasks = shopSetupTasks(settings);
  if (tasks[0].status === 'attention') return 0;
  if (tasks[2].status === 'attention') return 1;
  if (tasks[3].status === 'attention') return 2;
  return 3;
}
