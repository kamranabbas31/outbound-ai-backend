import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { CadenceService } from './cadence.service';

@Resolver('Cadence')
export class CadenceResolver {
  constructor(private readonly cadenceService: CadenceService) {}

  @Query('cadenceTemplates')
  async getCadenceTemplates(@Args('userId') userId: string) {
    return await this.cadenceService.getCadenceTemplates(userId);
  }

  @Mutation('createCadenceTemplate')
  async createCadenceTemplate(@Args('input') input) {
    try {
      const template = await this.cadenceService.createCadenceTemplate(input);
      return {
        success: true,
        userError: null,
        template,
      };
    } catch (error) {
      return {
        success: false,
        userError: {
          message: error.message || 'Failed to create cadence template',
        },
        template: null,
      };
    }
  }

  @Mutation('updateCadenceTemplate')
  async updateCadenceTemplate(@Args('input') input) {
    try {
      const template = await this.cadenceService.updateCadenceTemplate(input);
      return {
        userError: null,
        template,
      };
    } catch (error) {
      return {
        userError: {
          message: error.message || 'Failed to update cadence template',
        },
        template: null,
      };
    }
  }

  @Mutation('deleteCadenceTemplate')
  async deleteCadenceTemplate(@Args('id') id: string) {
    return this.cadenceService.deleteCadenceTemplate(id);
  }

  @Query('getCadenceProgressStats')
  async getCadenceProgressStats(@Args('campaignId') campaignId: string) {
    return await this.cadenceService.getCadenceProgressStats(campaignId);
  }
}
