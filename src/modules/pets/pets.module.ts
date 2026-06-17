import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pet.name, schema: PetSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PetsController],
  providers: [PetsService],
  exports: [PetsService],
})
export class PetsModule {}
