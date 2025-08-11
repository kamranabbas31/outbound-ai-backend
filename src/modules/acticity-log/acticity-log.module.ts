import { Module } from '@nestjs/common';
import { ActicityLogService } from './acticity-log.service';
import { ActicityLogResolver } from './acticity-log.resolver';

@Module({
  providers: [ActicityLogService, ActicityLogResolver]
})
export class ActicityLogModule {}
