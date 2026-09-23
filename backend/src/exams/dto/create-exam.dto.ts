import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'

export class CreateExamSubjectDto {
  @IsString()
  @IsNotEmpty()
  courseId!: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  maximumScore!: number
}

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  classroomId!: string

  @IsString()
  @IsNotEmpty()
  title!: string

  @IsString()
  @IsNotEmpty()
  type!: string

  @IsDateString()
  examDate!: string

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateExamSubjectDto)
  subjects!: CreateExamSubjectDto[]
}
