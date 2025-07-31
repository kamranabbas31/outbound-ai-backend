// trigger-call.dto.ts
import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsOptional } from 'class-validator';

@InputType()
export class TriggerCallInput {
  @Field()
  @IsString()
  leadId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  assistantId?: string;
}
