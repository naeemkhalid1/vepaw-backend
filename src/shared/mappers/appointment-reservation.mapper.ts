import { AppointmentReservationDocument } from '../../database/schemas/appointment-reservation.schema';
import { AppointmentReservationResponse } from '../types';

export function toAppointmentReservationResponse(
  reservation: AppointmentReservationDocument,
  checkoutUrl: string,
): AppointmentReservationResponse {
  return {
    id: reservation._id.toString(),
    fee: reservation.fee,
    platformCommission: reservation.platformCommission,
    vetPayout: reservation.vetPayout,
    date: reservation.date,
    timeSlot: reservation.timeSlot,
    expiresAt: reservation.expiresAt,
    checkoutUrl,
    vetDetails: reservation.vetDetails,
    petDetails: reservation.petDetails,
  };
}
