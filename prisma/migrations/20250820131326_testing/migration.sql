/*
  Warnings:

  - You are about to drop the column `status` on the `LeadActivityLog` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LeadActivityLog" DROP COLUMN "status",
ALTER COLUMN "duration" SET DATA TYPE DOUBLE PRECISION;
