import { InputType, Field } from '@nestjs/graphql';
import { ActivityType } from '@prisma/client';

@InputType()
export class LeadActivityLogFilterInput {
  @Field({ nullable: true })
  lead_id?: string;

  @Field({ nullable: true })
  campaign_id?: string;

  @Field(() => ActivityType, { nullable: true })
  activity_type?: ActivityType;
}
