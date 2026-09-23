import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateExamDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  type?: string

  @IsOptional()
  @IsDateString()
  examDate?: string
}
