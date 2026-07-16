// Order UI components shared across features.
// Secondary entry point (@dukarun/order/components) so that importing
// components does not pull page code into the eager services barrel.
export { OrderStateBadgeComponent } from './order-state-badge.component';
export { PayOrderModalComponent, type PayOrderModalData } from './pay-order-modal.component';
export { OrderTableRowComponent } from './order-table-row.component';
export { OrderCardComponent, type OrderAction } from './order-card.component';
export { OrderDetailComponent } from './order-detail/order-detail.component';
