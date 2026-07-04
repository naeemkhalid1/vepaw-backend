import { Types } from 'mongoose';
import { ConsultationSession } from '../../database/schemas/consultation-session.schema';
import { Vet } from '../../database/schemas/vet.schema';
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
  vet?: Pick<Vet, 'payoutMethod' | 'accountTitle' | 'mobileAccount'> | null,
): ConsultationSessionResponse {
  return {
    id: s._id.toString(),
    owner: (s.owner as Types.ObjectId).toString(),
    pet: (s.pet as Types.ObjectId).toString(),
    petName,
    vet: (s.vet as Types.ObjectId).toString(),
    vetName,
    amount: s.amount,
    status: s.status,
    paymentProofUrl: s.paymentProofUrl,
    paymentSubmittedAt: s.paymentSubmittedAt,
    paidAt: s.paidAt,
    startedAt: s.startedAt,
    autoExpireAt: s.autoExpireAt,
    closedAt: s.closedAt,
    closedBy: s.closedBy,
    paymentAccount: vet
      ? {
          payoutMethod: vet.payoutMethod,
          accountTitle: vet.accountTitle,
          mobileAccount: vet.mobileAccount,
        }
      : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
