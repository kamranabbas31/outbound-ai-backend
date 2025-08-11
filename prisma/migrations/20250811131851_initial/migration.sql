-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL_ATTEMPT', 'DISPOSITION_CHANGE', 'CADENCE_EXECUTION', 'NOTE_ADDED', 'STATUS_UPDATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leads_count" INTEGER NOT NULL,
    "completed" INTEGER NOT NULL,
    "in_progress" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "execution_status" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cadence_template_id" TEXT,
    "cadence_start_date" TIMESTAMP(3),
    "cadence_stopped" BOOLEAN NOT NULL DEFAULT false,
    "cadence_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leads" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone_number" TEXT,
    "phone_id" TEXT,
    "status" TEXT,
    "disposition" TEXT,
    "duration" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "recordingUrl" TEXT,
    "initiated_at" TIMESTAMP(3),
    "campaign_id" TEXT NOT NULL,

    CONSTRAINT "Leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phone_ids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_id" TEXT NOT NULL,
    "daily_usage" INTEGER NOT NULL DEFAULT 0,
    "last_used_date" TIMESTAMP(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Phone_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadenceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "retry_dispositions" TEXT[],
    "cadence_days" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadenceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadenceProgress" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT,
    "campaign_id" TEXT,
    "cadence_id" TEXT,
    "day" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "time_window" TEXT NOT NULL,

    CONSTRAINT "CadenceProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivityLog" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "activity_type" "ActivityType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_disposition" TEXT,
    "to_disposition" TEXT,
    "disposition_at" TIMESTAMP(3),
    "duration" INTEGER,
    "cost" DOUBLE PRECISION,
    "lead_status" TEXT,

    CONSTRAINT "LeadActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Phone_ids_phone_id_key" ON "Phone_ids"("phone_id");

-- CreateIndex
CREATE INDEX "LeadActivityLog_lead_id_campaign_id_idx" ON "LeadActivityLog"("lead_id", "campaign_id");

-- AddForeignKey
ALTER TABLE "Campaigns" ADD CONSTRAINT "Campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaigns" ADD CONSTRAINT "Campaigns_cadence_template_id_fkey" FOREIGN KEY ("cadence_template_id") REFERENCES "CadenceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leads" ADD CONSTRAINT "Leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceProgress" ADD CONSTRAINT "CadenceProgress_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceProgress" ADD CONSTRAINT "CadenceProgress_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceProgress" ADD CONSTRAINT "CadenceProgress_cadence_id_fkey" FOREIGN KEY ("cadence_id") REFERENCES "CadenceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityLog" ADD CONSTRAINT "LeadActivityLog_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityLog" ADD CONSTRAINT "LeadActivityLog_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
