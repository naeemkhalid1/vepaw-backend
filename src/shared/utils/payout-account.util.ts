export type PayoutMethod = 'jazzcash' | 'easypaisa' | 'bank_transfer';

export function payoutMethodLabel(method: PayoutMethod | null | undefined, bankName?: string | null): string {
  if (method === 'jazzcash') return 'JazzCash';
  if (method === 'easypaisa') return 'EasyPaisa';
  if (method === 'bank_transfer') return bankName || 'Bank Transfer';
  return 'JazzCash';
}

// Wallet payouts read walletNumber, bank payouts read accountNumber — never mix the two up.
export function payoutAccountValue(entity: {
  payoutMethod?: PayoutMethod | null;
  walletNumber?: string | null;
  accountNumber?: string | null;
} | null): string {
  if (!entity) return '';
  return entity.payoutMethod === 'bank_transfer' ? (entity.accountNumber ?? '') : (entity.walletNumber ?? '');
}

// Never expose a full account/wallet number in any read view — only the last 4 digits.
export function maskPayoutValue(entity: {
  payoutMethod?: PayoutMethod | null;
  walletNumber?: string | null;
  accountNumber?: string | null;
}): string {
  const value = payoutAccountValue(entity);
  return value.length > 4 ? '•••• ' + value.slice(-4) : value;
}
