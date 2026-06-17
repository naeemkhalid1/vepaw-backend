import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { toPetResponse, toVaccinationResponse } from '../../shared/mappers/pet.mapper';
import { PetResponse, ServiceResponse, VaccinationResponse } from '../../shared/types';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { AddVaccinationDto } from './dto/add-vaccination.dto';

@Injectable()
export class PetsService {
  constructor(
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async createPet(userId: string, dto: CreatePetDto): Promise<ServiceResponse<PetResponse>> {
    const pet = await this.petModel.create({
      owner: new Types.ObjectId(userId),
      name: dto.name,
      species: dto.species,
      breed: dto.breed,
      dateOfBirth: dto.dateOfBirth,
      weight: dto.weight,
      gender: dto.gender,
    });

    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $push: { pets: pet._id } },
    );

    return { data: toPetResponse(pet), message: 'Pet created' };
  }

  async getPet(userId: string, petId: string): Promise<ServiceResponse<PetResponse>> {
    const pet = await this.findOwnedPet(userId, petId);
    return { data: toPetResponse(pet), message: 'Pet fetched' };
  }

  async updatePet(
    userId: string,
    petId: string,
    dto: UpdatePetDto,
  ): Promise<ServiceResponse<PetResponse>> {
    await this.findOwnedPet(userId, petId);

    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.breed !== undefined) update.breed = dto.breed;
    if (dto.weight !== undefined) update.weight = dto.weight;
    if (dto.color !== undefined) update.color = dto.color;
    if (dto.photo !== undefined) update.photo = dto.photo;
    if (dto.vaccinationStatus !== undefined) update.vaccinationStatus = dto.vaccinationStatus;
    if (dto.allergies !== undefined) update.allergies = dto.allergies;
    if (dto.currentMedications !== undefined) update.currentMedications = dto.currentMedications;
    if (dto.remindersEnabled !== undefined) update.remindersEnabled = dto.remindersEnabled;

    const updated = await this.petModel
      .findByIdAndUpdate(petId, { $set: update }, { new: true, runValidators: true })
      .exec();

    return { data: toPetResponse(updated!), message: 'Pet updated' };
  }

  async deletePet(userId: string, petId: string): Promise<ServiceResponse<null>> {
    await this.findOwnedPet(userId, petId);

    await Promise.all([
      this.petModel.updateOne({ _id: petId }, { $set: { isActive: false } }).exec(),
      this.userModel
        .updateOne({ _id: new Types.ObjectId(userId) }, { $pull: { pets: new Types.ObjectId(petId) } })
        .exec(),
    ]);

    return { data: null, message: 'Pet deleted' };
  }

  async addVaccination(
    userId: string,
    petId: string,
    dto: AddVaccinationDto,
  ): Promise<ServiceResponse<VaccinationResponse>> {
    await this.findOwnedPet(userId, petId);

    const newId = new Types.ObjectId();
    const updated = await this.petModel
      .findByIdAndUpdate(
        petId,
        {
          $push: {
            vaccinations: {
              _id: newId,
              name: dto.name,
              date: dto.date,
              nextDue: dto.nextDue,
              vetName: dto.vetName,
              vetId: dto.vetId ? new Types.ObjectId(dto.vetId) : null,
              verified: dto.verified ?? false,
              notes: dto.notes ?? null,
              certificatePhoto: dto.certificatePhoto ?? null,
            },
          },
        },
        { new: true },
      )
      .exec();

    const newVax = updated!.vaccinations.find(
      (v) => (v as unknown as { _id: Types.ObjectId })._id.equals(newId),
    )!;

    return { data: toVaccinationResponse(newVax), message: 'Vaccination added' };
  }

  async getPassportPdf(
    userId: string,
    petId: string,
  ): Promise<ServiceResponse<{ url: string | null }>> {
    const pet = await this.findOwnedPet(userId, petId);
    return { data: { url: pet.passportUrl }, message: 'Passport URL fetched' };
  }

  private async findOwnedPet(userId: string, petId: string): Promise<PetDocument> {
    if (!Types.ObjectId.isValid(petId)) {
      throw new NotFoundException({ message: 'Pet not found', code: 'PET_NOT_FOUND' });
    }

    const pet = await this.petModel
      .findOne({ _id: petId, isActive: true })
      .exec();

    if (!pet) {
      throw new NotFoundException({ message: 'Pet not found', code: 'PET_NOT_FOUND' });
    }

    if (pet.owner.toString() !== userId) {
      throw new ForbiddenException({ message: 'You do not own this pet', code: 'FORBIDDEN' });
    }

    return pet;
  }
}
