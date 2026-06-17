import { Types } from 'mongoose';
import { PetDocument, Vaccination } from '../../database/schemas/pet.schema';
import { PetResponse, VaccinationResponse } from '../types';

type VaccinationDoc = Vaccination & { _id: Types.ObjectId };

export function toVaccinationResponse(vax: Vaccination): VaccinationResponse {
  const doc = vax as VaccinationDoc;
  return {
    id: doc._id.toString(),
    name: vax.name,
    date: vax.date,
    nextDue: vax.nextDue,
    vetId: vax.vetId ? vax.vetId.toString() : null,
    vetName: vax.vetName,
    verified: vax.verified,
    notes: vax.notes,
    certificatePhoto: vax.certificatePhoto,
  };
}

export function toPetResponse(pet: PetDocument): PetResponse {
  return {
    id: pet._id.toString(),
    owner: pet.owner.toString(),
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    dateOfBirth: pet.dateOfBirth,
    weight: pet.weight,
    gender: pet.gender,
    color: pet.color,
    photo: pet.photo,
    vaccinations: pet.vaccinations.map(toVaccinationResponse),
    medicalHistory: pet.medicalHistory,
    allergies: pet.allergies,
    currentMedications: pet.currentMedications,
    vaccinationStatus: pet.vaccinationStatus,
    remindersEnabled: pet.remindersEnabled,
    isActive: pet.isActive,
    passportUrl: pet.passportUrl,
    createdAt: pet.createdAt,
    updatedAt: pet.updatedAt,
  };
}
