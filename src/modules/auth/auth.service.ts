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

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
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

    return {
      message: 'User registered',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }

  async login(dto: LoginDto, res: Response) {
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

    return {
      accessToken,
      user: { id: user.id, username: user.username },
    };
  }

  async refreshToken(refresh_token: string) {
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

      return {
        accessToken,
        // Assuming user object is available in the context
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
