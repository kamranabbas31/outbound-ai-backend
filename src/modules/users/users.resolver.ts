import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { UsersService } from './users.service';
import { RegisterDto } from '../auth/dto/register.dto';

@Resolver()
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Mutation('createUser')
  async createUser(@Args('data') data: RegisterDto) {
    return this.usersService.createUser(data);
  }

  @Query('getUser')
  async getUser(@Args('id') id: string) {
    return this.usersService.findById(id);
  }
}
