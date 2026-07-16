import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';

const NOTIFY_STAFF_ROLES: ('admin_vet' | 'manager')[] = [
  'admin_vet',
  'manager',
];

@Injectable()
export class ClinicTeamService {
  constructor(
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
  ) {}

  // Financially-relevant clinic staff for a given vet — the same authority boundary already
  // used for payout settings (admin_vet + manager, never team_vet). Falls back to just the
  // vet themselves if they have no clinic yet (shouldn't happen for an approved vet, but every
  // vet is guaranteed to at least be notifiable about their own appointments).
  async resolveNotifyTargets(vetId: string): Promise<Types.ObjectId[]> {
    const vet = await this.vetModel
      .findById(vetId)
      .select('clinicId')
      .lean()
      .exec();
    if (!vet) throw new NotFoundException('Vet not found');

    if (!vet.clinicId) {
      return [vet._id];
    }

    const clinicStaff = await this.vetModel
      .find({ clinicId: vet.clinicId, staffRole: { $in: NOTIFY_STAFF_ROLES } })
      .select('_id')
      .lean()
      .exec();

    return clinicStaff.map((v) => v._id);
  }
}
