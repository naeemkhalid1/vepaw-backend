import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import { Order, OrderDocument } from '../../database/schemas/order.schema';
import { ServiceResponse } from '../../shared/types';
import { toVetResponse } from '../../shared/mappers/vet.mapper';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  async getPendingVets(page: number, limit: number): Promise<ServiceResponse<object[]>> {
    const filter = { verified: false };
    const skip = (page - 1) * limit;

    const [vets, total] = await Promise.all([
      this.vetModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.vetModel.countDocuments(filter),
    ]);

    return {
      data: vets.map((v) => toVetResponse(v as Parameters<typeof toVetResponse>[0])),
      message: 'Pending vet applications retrieved',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async approveVet(vetId: string): Promise<ServiceResponse<object>> {
    const vet = await this.vetModel.findById(vetId);
    if (!vet) throw new NotFoundException({ code: 'VET_NOT_FOUND', message: 'Vet not found' });

    vet.verified = true;
    vet.subscriptionStatus = 'active';
    await vet.save();

    return {
      data: toVetResponse(vet.toObject() as Parameters<typeof toVetResponse>[0]),
      message: 'Vet approved',
    };
  }

  async getAnalytics(): Promise<ServiceResponse<object>> {
    const [totalUsers, totalVets, totalAppointments, totalOrders, revenueResult] = await Promise.all([
      this.userModel.countDocuments(),
      this.vetModel.countDocuments({ verified: true }),
      this.appointmentModel.countDocuments(),
      this.orderModel.countDocuments(),
      this.appointmentModel.aggregate([
        { $match: { paymentStatus: { $in: ['held', 'released'] } } },
        { $group: { _id: null, total: { $sum: '$platformCommission' } } },
      ]),
    ]);

    const platformRevenuePKR = revenueResult[0]?.total ?? 0;

    return {
      data: {
        totalUsers,
        totalVets,
        totalAppointments,
        totalOrders,
        platformRevenuePKR,
      },
      message: 'Analytics retrieved',
    };
  }
}
