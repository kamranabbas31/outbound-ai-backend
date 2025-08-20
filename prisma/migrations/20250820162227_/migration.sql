-- AlterTable
ALTER TABLE "CadenceTemplate" ADD COLUMN     "user_id" TEXT;

-- AddForeignKey
ALTER TABLE "CadenceTemplate" ADD CONSTRAINT "CadenceTemplate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
