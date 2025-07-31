import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { TriggerCallService } from './trigger-call.service';
import { TriggerCallInput } from './dto/trigger-call.dto';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from 'src/gaurds/jwt-auth.guard';
import { CTX } from 'src/types/context.type';

@Resolver()
export class TriggerCallResolver {
  constructor(private readonly triggerCallService: TriggerCallService) {}

  @UseGuards(GqlAuthGuard)
  @Mutation('triggerCall')
  async triggerCall(@Args('input') input: TriggerCallInput): Promise<any> {
    return this.triggerCallService.triggerCall(input);
  }
}
