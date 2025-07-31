import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Response } from 'express';

@Resolver('Auth')
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Mutation('register')
  async register(@Args('data') data: RegisterDto) {
    return this.authService.register(data);
  }

  @Mutation('login')
  async login(@Args('data') data: LoginDto, @Context() context) {
    const res: Response = context.res;
    return this.authService.login(data, res);
  }

  @Mutation('refresh')
  async refresh(@Context() context) {
    const req = context.req;
    const token = req.cookies['refresh_token'];
    return this.authService.refreshToken(token);
  }
}
