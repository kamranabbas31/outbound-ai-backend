-- AlterTable
ALTER TABLE "Campaigns" ADD COLUMN     "cadence_paused_at" TIMESTAMP(3),
ADD COLUMN     "cadence_resume_day" INTEGER,
ADD COLUMN     "cadence_resume_from_date" TIMESTAMP(3);
