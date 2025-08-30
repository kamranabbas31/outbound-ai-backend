import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Response } from 'express';
import { AppLogger } from '../../utils/logger';

@Injectable()
export class AuthService {
  private readonly logger = new AppLogger();

  constructor(
    private usersService: UsersService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    this.logger.logStart('AuthService', 'register', {
      email: dto.email,
      username: dto.username,
    });
    try {
      const existingEmail = await this.usersService.findByEmail(dto.email);
      if (existingEmail) throw new ForbiddenException('Email already in use');
      const existingUsername = await this.usersService.findByUsername(
        dto.username,
      );
      if (existingUsername)
        throw new ForbiddenException('Username already in use');
      const hashed = await bcrypt.hash(dto.password, 10);
      const user = await this.usersService.createUser({
        ...dto,
        password: hashed,
      });

      const result = {
        message: 'User registered',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      };
      this.logger.logEnd('AuthService', 'register', result);
      return result;
    } catch (error) {
      this.logger.logFailed('AuthService', 'register', error);
      throw error;
    }
  }

  async login(dto: LoginDto, res: Response) {
    this.logger.logStart('AuthService', 'login', { username: dto.username });
    try {
      const user = await this.usersService.findByUsername(dto.username);
      if (!user || !(await bcrypt.compare(dto.password, user.password))) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const accessToken = this.jwt.sign(
        { sub: user.id },
        {
          secret: process.env.JWT_SECRET,
          expiresIn: process.env.JWT_EXPIRES_IN,
        },
      );

      const refreshToken = this.jwt.sign(
        { sub: user.id },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
        },
      );

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const result = {
        accessToken,
        user: { id: user.id, username: user.username },
      };
      this.logger.logEnd('AuthService', 'login', {
        userId: user.id,
        username: user.username,
      });
      return result;
    } catch (error) {
      this.logger.logFailed('AuthService', 'login', error);
      throw error;
    }
  }

  async refreshToken(refresh_token: string) {
    this.logger.logStart('AuthService', 'refreshToken');
    try {
      const payload = this.jwt.verify(refresh_token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const accessToken = this.jwt.sign(
        { sub: payload.sub },
        {
          secret: process.env.JWT_SECRET,
          expiresIn: process.env.JWT_EXPIRES_IN,
        },
      );

      const result = {
        accessToken,
        // Assuming user object is available in the context
      };
      this.logger.logEnd('AuthService', 'refreshToken', {
        userId: payload.sub,
      });
      return result;
    } catch (error) {
      this.logger.logFailed('AuthService', 'refreshToken', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
