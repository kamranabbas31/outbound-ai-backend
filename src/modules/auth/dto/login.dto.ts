import { InputType, Field } from '@nestjs/graphql';
import { IsEmail, IsString } from 'class-validator';

@InputType()
export class LoginDto {
  @Field()
  @IsEmail()
  username: string;

  @Field()
  @IsString()
  password: string;
}
