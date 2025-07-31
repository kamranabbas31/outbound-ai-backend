-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
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

    CONSTRAINT "Campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "phone_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordingUrl" TEXT NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL,
    "campaign_id" TEXT NOT NULL,

    CONSTRAINT "Leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phone_ids" (
    "id" TEXT NOT NULL,
    "phone_id" TEXT NOT NULL,
    "daily_usage" INTEGER NOT NULL,
    "last_used_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Phone_ids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Phone_ids_phone_id_key" ON "Phone_ids"("phone_id");

-- AddForeignKey
ALTER TABLE "Campaigns" ADD CONSTRAINT "Campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leads" ADD CONSTRAINT "Leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
