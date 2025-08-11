import { Field, Float, Int, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class DashboardStats {
    @Field(() => Int)
    completed: number;

    @Field(() => Int)
    inProgress: number;

    @Field(() => Int)
    remaining: number;

    @Field(() => Int)
    failed: number;

    @Field(() => Float)
    totalDuration: number;

    @Field(() => Float)
    totalCost: number;
}

@ObjectType()
export class DashboardStatsResponse {
    @Field(() => DashboardStats, { nullable: true })
    data?: DashboardStats;

    @Field(() => String, { nullable: true })
    userError?: string;
}