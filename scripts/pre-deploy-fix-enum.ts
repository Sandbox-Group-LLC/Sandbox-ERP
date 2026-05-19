import { PrismaClient } from "@prisma/client"

async function fixProofStatusEnum() {
  const prisma = new PrismaClient()
  
  try {
    console.log("Checking for old ProofStatus enum values...")
    
    const oldValues: any[] = await prisma.$queryRaw`
      SELECT id, status::text as status FROM "ProofRequest" 
      WHERE status::text IN ('PENDING_REVIEW', 'REVISION_REQUESTED')
    `
    
    if (oldValues.length === 0) {
      console.log("No old enum values found. Skipping fix.")
      return
    }

    console.log(`Found ${oldValues.length} records with old status values. Fixing...`)

    const newEnumValues = ['REQUESTED', 'IN_PROGRESS', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'REVISIONS_NEEDED', 'PRODUCTION']
    
    for (const val of newEnumValues) {
      try {
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProofStatus') AND enumlabel = '${val}') THEN
              ALTER TYPE "ProofStatus" ADD VALUE '${val}';
            END IF;
          END $$;
        `)
      } catch (e) {
        // Value may already exist
      }
    }

    await prisma.$executeRaw`UPDATE "ProofRequest" SET status = 'CLIENT_REVIEW' WHERE status::text = 'PENDING_REVIEW'`
    await prisma.$executeRaw`UPDATE "ProofRequest" SET status = 'REVISIONS_NEEDED' WHERE status::text = 'REVISION_REQUESTED'`
    
    console.log("Successfully fixed old ProofStatus enum values.")
  } catch (error) {
    console.error("Error fixing enum:", error)
  } finally {
    await prisma.$disconnect()
  }
}

fixProofStatusEnum()
