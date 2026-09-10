-- AlterEnum: Add OPEN to ServiceRequestStatus
ALTER TYPE "ServiceRequestStatus" ADD VALUE IF NOT EXISTS 'OPEN' BEFORE 'PENDING';

-- Update default for new service requests
ALTER TABLE "service_requests" ALTER COLUMN "status" SET DEFAULT 'OPEN';
