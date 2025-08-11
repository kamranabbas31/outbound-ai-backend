import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { CadenceService } from './cadence.service';

@Resolver('Cadence')
export class CadenceResolver {
  constructor(private readonly cadenceService: CadenceService) {}

  @Query('cadenceTemplates')
  async getCadenceTemplates() {
    return await this.cadenceService.getCadenceTemplates();
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

  @Mutation('deleteCadenceTemplate')
  async deleteCadenceTemplate(@Args('id') id: string) {
    return this.cadenceService.deleteCadenceTemplate(id);
  }
}
