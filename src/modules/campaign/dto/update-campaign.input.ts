import { InputType, Field, Float, Int } from '@nestjs/graphql';

@InputType()
export class UpdateCampaignInput {
  @Field()
  id: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  file_name?: string;

  @Field({ nullable: true })
  status?: string;

  @Field(() => Int, { nullable: true })
  leads_count?: number;

  @Field(() => Int, { nullable: true })
  completed?: number;

  @Field(() => Int, { nullable: true })
  in_progress?: number;

  @Field(() => Int, { nullable: true })
  remaining?: number;

  @Field(() => Int, { nullable: true })
  failed?: number;

  @Field(() => Float, { nullable: true })
  duration?: number;

  @Field(() => Float, { nullable: true })
  cost?: number;

  @Field({ nullable: true })
  execution_status?: string;

  @Field({ nullable: true })
  cadence_template_id?: string;

  @Field(() => Date, { nullable: true })
  cadence_start_date?: Date;

  @Field({ nullable: true })
  cadence_stopped?: boolean;

  @Field({ nullable: true })
  cadence_completed?: boolean;
}
