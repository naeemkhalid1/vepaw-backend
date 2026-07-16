import { Types } from 'mongoose';
import { ConsultationSession } from '../../database/schemas/consultation-session.schema';
import { Clinic } from '../../database/schemas/clinic.schema';
import { ConsultationSessionResponse } from '../types';

type ConsultationSessionDoc = ConsultationSession & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function toConsultationSessionResponse(
  s: ConsultationSessionDoc,
  petName: string,
  vetName: string,
  ownerName: string,
  clinic?: Pick<Clinic, 'payoutMethod' | 'accountTitle' | 'mobileAccount'> | null,
  checkoutUrl?: string | null,
): ConsultationSessionResponse {
  return {
    id: s._id.toString(),
    owner: (s.owner as Types.ObjectId).toString(),
    ownerName,
    pet: (s.pet as Types.ObjectId).toString(),
    petName,
    vet: (s.vet as Types.ObjectId).toString(),
    vetName,
    amount: s.amount,
    status: s.status,
    paymentReference: s.paymentReference,
    checkoutUrl,
    paidAt: s.paidAt,
    startedAt: s.startedAt,
    autoExpireAt: s.autoExpireAt,
    closedAt: s.closedAt,
    closedBy: s.closedBy,
    resolvedBy: s.resolvedBy ? (s.resolvedBy as Types.ObjectId).toString() : null,
    resolvedByRole: s.resolvedByRole,
    disputeReason: s.disputeReason,
    adminResolvedBy: s.adminResolvedBy ? (s.adminResolvedBy as Types.ObjectId).toString() : null,
    adminResolvedAt: s.adminResolvedAt,
    refundRequired: s.refundRequired,
    paymentAccount: clinic
      ? {
          payoutMethod: clinic.payoutMethod,
          accountTitle: clinic.accountTitle,
          mobileAccount: clinic.mobileAccount,
        }
      : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
