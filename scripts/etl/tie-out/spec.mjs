// Shared tie-out fixture spec: identical operation sequence for both backends.
// All money in cents. NOTE on op (b): the task brief says "split payment cash
// 200000/mpesa 45000" but 12 @ 20000 = 240000 != 245000. We use cash 200000 /
// mpesa 40000 so the split sums to the order total (documented in the report).

export const SPEC = {
  product: { name: 'TieOut Unga', variantName: '2kg', sku: 'TIE-UNGA2', price: 20000 },
  serviceProduct: { name: 'TieOut Service', variantName: 'Delivery', sku: 'TIE-SVC', price: 5000 },
  customer: { firstName: 'TieOut', lastName: 'Customer', phone: '+254700000010', creditLimit: 100000 },
  supplier: { firstName: 'TieOut', lastName: 'Supplier', phone: '+254700000011', creditLimit: 500000 },

  ops: {
    a1: { qty: 10, unitCost: 10000 }, // -> InventoryPurchase DR INVENTORY 100000 / CR CASH_ON_HAND
    a2: { qty: 10, unitCost: 15000 }, // -> DR INVENTORY 150000 / CR CASH_ON_HAND
    b: {
      qty: 12, unitPrice: 20000, total: 240000,
      payments: [
        { method: 'cash', amount: 200000 },
        { method: 'mpesa', amount: 40000 },
      ],
      expectedCogs: 130000, // FIFO 10@10000 + 2@15000
    },
    c: { qty: 2, unitPrice: 5000, total: 10000 }, // credit sale, service
    d: { amount: 3000, method: 'cash' }, // AR repayment
    e: { amount: 5000, account: 'CASH_ON_HAND', category: 'operations' }, // expense
    f: { from: 'CASH_ON_HAND', to: 'BANK_MAIN', principal: 30000, fee: 500 },
    g: { qty: 8, unitCost: 9000, total: 72000, payment: 36000, account: 'CASH_ON_HAND' },
    h: { qty: 1, reason: 'damaged', expectedCost: 15000 }, // write-off, FIFO from batch2
    i: { shortBy: 1000 }, // cashier session close: declared cash 1000 short
  },
};

export function nairobiToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
}
