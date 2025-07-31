import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Client } from 'pg';
import { OnModuleInit } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*', // Replace with your frontend origin in production
  },
})
export class NotificationsGateway implements OnModuleInit, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private pgClient: Client;

  async onModuleInit() {
    this.pgClient = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    await this.pgClient.connect();

    // Listen to Postgres NOTIFY channels
    await this.pgClient.query('LISTEN leads_changes');
    await this.pgClient.query('LISTEN campaigns_changes');

    // Subscribe to DB notifications
    this.pgClient.on('notification', (msg) => {
      const payload = JSON.parse(msg.payload || '{}');

      if (msg.channel === 'leads_changes') {
        // console.log('[WS] Lead changed:', payload);
        this.server?.emit('leads-changed', payload);
      }

      if (msg.channel === 'campaigns_changes') {
        // console.log('[WS] Campaign changed:', payload);
        this.server?.emit('campaigns-changed', payload);
      }
    });

    console.log('[WS] PostgreSQL client connected and listeners registered');
  }

  afterInit() {
    console.log('[WS] WebSocket Gateway initialized');
  }
}
