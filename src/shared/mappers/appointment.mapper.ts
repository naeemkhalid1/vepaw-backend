import { Types } from 'mongoose';
import { AppointmentDocument } from '../../database/schemas/appointment.schema';
import { AppointmentResponse } from '../types';

export function toAppointmentResponse(apt: AppointmentDocument): AppointmentResponse {
  return {
    id: apt._id.toString(),
    pet: apt.pet.toString(),
    vet: apt.vet.toString(),
    owner: apt.owner.toString(),
    date: apt.date,
    timeSlot: apt.timeSlot,
    status: apt.status,
    fee: apt.fee,
    platformCommission: apt.platformCommission,
    vetPayout: apt.vetPayout,
    paymentMethod: apt.paymentMethod,
    paymentStatus: apt.paymentStatus,
    paymentReference: apt.paymentReference,
    notes: apt.notes,
    reviewId: apt.reviewId ? (apt.reviewId as Types.ObjectId).toString() : null,
    vetDetails: apt.vetDetails,
    petDetails: apt.petDetails,
    createdAt: apt.createdAt,
    updatedAt: apt.updatedAt,
  };
}
