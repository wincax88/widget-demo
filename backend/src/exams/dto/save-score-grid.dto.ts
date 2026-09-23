import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator'

export class ScoreCellDto {
  @IsString()
  @IsNotEmpty()
  studentEduplusId!: string

  @IsString()
  @IsNotEmpty()
  subjectId!: string

  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  score!: number | null

  @IsBoolean()
  absent!: boolean
}

export class SaveScoreGridDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreCellDto)
  cells!: ScoreCellDto[]
}

export class ImportScoresDto {
  @IsString()
  @IsNotEmpty()
  filename!: string

  @IsString()
  @IsNotEmpty()
  csv!: string
}
