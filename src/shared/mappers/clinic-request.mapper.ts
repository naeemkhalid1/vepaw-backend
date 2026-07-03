import { Types } from 'mongoose';
import { ClinicDispense } from '../../database/schemas/clinic-dispense.schema';
import { ClinicDispenseResponse } from '../types';

type ClinicDispenseDoc = ClinicDispense & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function toClinicDispenseResponse(
  d: ClinicDispenseDoc,
  petName: string,
  vetName: string,
): ClinicDispenseResponse {
  return {
    id: d._id.toString(),
    owner: (d.owner as Types.ObjectId).toString(),
    pet: (d.pet as Types.ObjectId).toString(),
    petName,
    vet: (d.vet as Types.ObjectId).toString(),
    vetName,
    listing: (d.listing as Types.ObjectId).toString(),
    itemName: d.itemName,
    unitPrice: d.unitPrice,
    qty: d.qty,
    totalPrice: d.unitPrice * d.qty,
    status: d.status,
    confirmedAt: d.confirmedAt,
    dispensedAt: d.dispensedAt,
    declinedAt: d.declinedAt,
    cancelledAt: d.cancelledAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
