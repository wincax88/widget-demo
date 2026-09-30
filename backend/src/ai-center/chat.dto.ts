import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsString, Matches,
  Max, MaxLength, Min, Validate, ValidateIf, ValidateNested,
  ValidatorConstraint, ValidatorConstraintInterface,
} from 'class-validator'
import { ChatInput } from './ai-center.service'

class ChatMessageDto {
  @IsIn(['system', 'user', 'assistant'])
  role: 'system' | 'user' | 'assistant'

  @IsString()
  @Matches(/\S/, { message: 'content must contain non-whitespace text' })
  @MaxLength(8000)
  content: string
}

@ValidatorConstraint({ name: 'conversationLength', async: false })
class ConversationLength implements ValidatorConstraintInterface {
  validate(messages: unknown) {
    return Array.isArray(messages) && messages.every((message: unknown) =>
      message !== null && typeof message === 'object' && typeof (message as ChatMessageDto).content === 'string')
      && messages.reduce((sum: number, message: ChatMessageDto) => sum + message.content.length, 0) <= 32000
  }

  defaultMessage() {
    return 'messages must contain at most 32000 characters in total'
  }
}

export class ChatDto implements ChatInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  @Validate(ConversationLength)
  messages: ChatMessageDto[]

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/\S/)
  @MaxLength(128)
  model?: string

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(4096)
  max_tokens?: number

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(2)
  temperature?: number
}
