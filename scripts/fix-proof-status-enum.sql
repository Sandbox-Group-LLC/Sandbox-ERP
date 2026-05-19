-- Fix production ProofStatus enum migration
-- Run this BEFORE deploying the new schema

-- Step 1: Add new enum values to the existing ProofStatus enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProofStatus') AND enumlabel = 'REQUESTED') THEN
    ALTER TYPE "ProofStatus" ADD VALUE 'REQUESTED';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProofStatus') AND enumlabel = 'IN_PROGRESS') THEN
    ALTER TYPE "ProofStatus" ADD VALUE 'IN_PROGRESS';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProofStatus') AND enumlabel = 'INTERNAL_REVIEW') THEN
    ALTER TYPE "ProofStatus" ADD VALUE 'INTERNAL_REVIEW';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProofStatus') AND enumlabel = 'CLIENT_REVIEW') THEN
    ALTER TYPE "ProofStatus" ADD VALUE 'CLIENT_REVIEW';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProofStatus') AND enumlabel = 'REVISIONS_NEEDED') THEN
    ALTER TYPE "ProofStatus" ADD VALUE 'REVISIONS_NEEDED';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProofStatus') AND enumlabel = 'PRODUCTION') THEN
    ALTER TYPE "ProofStatus" ADD VALUE 'PRODUCTION';
  END IF;
END $$;

-- Step 2: Convert old status values to new ones
UPDATE "ProofRequest" SET status = 'CLIENT_REVIEW' WHERE status::text = 'PENDING_REVIEW';
UPDATE "ProofRequest" SET status = 'REVISIONS_NEEDED' WHERE status::text = 'REVISION_REQUESTED';
