// dto/register.dto.ts
import { ArgsType, Field } from '@nestjs/graphql';

@ArgsType()
export class RegisterDto {
  @Field()
  username: string;

  @Field()
  email: string;

  @Field()
  password: string;
}
