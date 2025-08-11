import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { GraphQLJSON } from 'graphql-type-json'; // 👈 import scalar
import { WebhookModule } from './modules/webhook/webhook.module';
import { TriggerCallModule } from './modules/call/trigger-call.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { BillingModule } from './modules/billing/billing.module';
import { PhoneIdsModule } from './modules/phone_ids/phone_ids.module';
import { NotificationsGateway } from './modules/socket/notifications.gateway';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CadenceModule } from './modules/cadence/cadence.module';
import { ActicityLogModule } from './modules/acticity-log/acticity-log.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: ['./**/*.graphql'],
      definitions: {
        path: join(process.cwd(), 'src/graphql.ts'),
      },
      resolvers: {
        JSON: GraphQLJSON,
      },
      context: ({ req, res }) => ({ req, res }), // ✅ add this line
    }),

    TriggerCallModule,
    WebhookModule,
    UsersModule,
    AuthModule,
    CampaignModule,
    BillingModule,
    PhoneIdsModule,
    CadenceModule,
    ActicityLogModule,
    DashboardModule,
  ],
  providers: [NotificationsGateway],
})
export class AppModule { }
