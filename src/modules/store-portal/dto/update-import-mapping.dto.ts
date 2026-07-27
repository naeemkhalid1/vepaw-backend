import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IMPORT_FIELDS,
  ImportField,
} from '../../../shared/utils/product-import.util';

class ColumnMappingEntryDto {
  @ApiProperty({
    description:
      'Index of the CSV column, as returned by the upload/preview response',
  })
  @IsInt()
  @Min(0)
  columnIndex: number;

  @ApiPropertyOptional({
    enum: IMPORT_FIELDS,
    nullable: true,
    description: 'null to unmap this column',
  })
  @IsOptional()
  @IsIn(IMPORT_FIELDS)
  mappedField?: ImportField | null;
}

export class UpdateImportMappingDto {
  @ApiProperty({ type: [ColumnMappingEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnMappingEntryDto)
  columnMappings: ColumnMappingEntryDto[];
}
