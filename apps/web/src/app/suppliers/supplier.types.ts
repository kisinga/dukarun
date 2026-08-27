import type { AgingInfo, MoneyCustomer } from '../money/money.service';

export type SupplierWithAp = MoneyCustomer & { ap_balance: number } & AgingInfo;
