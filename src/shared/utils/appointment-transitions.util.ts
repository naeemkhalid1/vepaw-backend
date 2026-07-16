export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'no-show'
  | 'disputed';

// Single source of truth for valid appointment status transitions — shared by every vet-facing
// path that can change one (appointments.service.ts's dedicated complete/cancel endpoints and
// vet-portal.service.ts's generic status endpoint), so the rules can't drift out of sync between
// them again the way the payment-release step once did.
const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  // 'completed' is reachable directly from 'pending' too — matches the pre-existing
  // completeAppointment() behavior (e.g. a walk-in COD visit that was never formally
  // "confirmed" beforehand can still be marked done).
  pending: ['confirmed', 'completed', 'cancelled'],
  confirmed: ['in-progress', 'completed', 'cancelled', 'no-show'],
  'in-progress': ['completed'],
  // Owner-initiated only (disputeAppointment), within the payout hold window — not reachable
  // through the vet-facing generic status update.
  completed: ['disputed'],
  cancelled: [],
  'no-show': [],
  // Terminal from this state machine's perspective — resolved directly by an admin action
  // (resolveDisputedAppointment) rather than through isValidAppointmentTransition.
  disputed: [],
};

export function isValidAppointmentTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// How long after a safepay appointment is marked complete before its held payout auto-releases
// to the vet — gives the owner a window to dispute (they're on-site for the visit, so a short
// window is enough, unlike multi-day pet-boarding marketplaces). Shared by both vet-facing
// "mark complete" paths (appointments.service.ts and vet-portal.service.ts) for the same reason
// isValidAppointmentTransition is shared — so they can't drift out of sync.
export const PAYOUT_HOLD_MS = 3 * 60 * 60 * 1000;
