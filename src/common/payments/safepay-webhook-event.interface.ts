export interface SafepayWebhookEvent {
  type: string;
  token: string;
  data: {
    tracker?:
      | string
      | {
          token: string;
          metadata?: { order_id?: string; data?: { order_id?: string } };
        };
    order_id?: string;
    metadata?: { order_id?: string };
    amount?: number;
    [key: string]: unknown;
  };
  created_at?: string;
}

export function extractTrackerToken(event: SafepayWebhookEvent): string | null {
  const tracker = event.data?.tracker;
  if (!tracker) return null;
  return typeof tracker === 'string' ? tracker : tracker.token;
}

// Real webhook payload shape is unconfirmed — our session.setup test call showed order_id
// nested at tracker.metadata.data.order_id, but the docs' payment.succeeded field list implies
// it may also sit flatter. Walk every plausible path rather than guessing a single one.
export function extractOrderId(event: SafepayWebhookEvent): string | null {
  const tracker = event.data?.tracker;
  const trackerMetadata =
    typeof tracker === 'object' ? tracker.metadata : undefined;

  return (
    event.data?.metadata?.order_id ??
    trackerMetadata?.data?.order_id ??
    trackerMetadata?.order_id ??
    event.data?.order_id ??
    null
  );
}

// Safepay echoes back the raw amount exactly as it was sent to session.setup — which is in
// paisas (see SafepayService.createCheckoutSession) — so convert back to whole PKR here to
// match the whole-rupee values (e.g. reservation.fee) used everywhere else in this codebase.
export function extractAmount(event: SafepayWebhookEvent): number | undefined {
  return typeof event.data?.amount === 'number'
    ? event.data.amount / 100
    : undefined;
}
