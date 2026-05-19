import { PrismaClient } from "@prisma/client"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const prisma = new PrismaClient()

function findTaxCodesFile(): string {
  const possiblePaths = [
    path.join(__dirname, "tax-codes-data.json"),
    path.join(process.cwd(), "prisma", "tax-codes-data.json"),
    path.resolve("prisma/tax-codes-data.json"),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log(`Found tax codes file at: ${p}`);
      return p;
    }
  }
  
  throw new Error(`Could not find tax-codes-data.json. Tried: ${possiblePaths.join(", ")}`);
}

interface TaxCodeData {
  categoryCode: string;
  jurisdiction: string;
  taxRate: number;
  isTaxable: boolean;
  defaultMarkup: number;
}

const STAFFING_RATES = [
  { roleName: "Executive Producer", internalRate: 250 },
  { roleName: "Senior Producer", internalRate: 200 },
  { roleName: "Producer", internalRate: 150 },
  { roleName: "Associate Producer", internalRate: 100 },
  { roleName: "Production Assistant", internalRate: 50 },
  { roleName: "Creative Director", internalRate: 225 },
  { roleName: "Art Director", internalRate: 175 },
  { roleName: "Graphic Designer", internalRate: 125 },
  { roleName: "Project Manager", internalRate: 150 },
  { roleName: "Event Manager", internalRate: 125 },
  { roleName: "Site Manager", internalRate: 100 },
  { roleName: "Technical Director", internalRate: 200 },
  { roleName: "Audio Engineer", internalRate: 150 },
  { roleName: "Video Engineer", internalRate: 150 },
  { roleName: "Lighting Designer", internalRate: 150 },
  { roleName: "Stage Manager", internalRate: 100 },
  { roleName: "Registration Staff", internalRate: 35 },
  { roleName: "Event Staff", internalRate: 30 },
  { roleName: "Security", internalRate: 40 },
  { roleName: "Catering Manager", internalRate: 75 },
];

async function main() {
  console.log("Seeding reference data (TaxCodes and StaffingRates)...");

  const taxCodesPath = findTaxCodesFile();
  const taxCodesRaw = fs.readFileSync(taxCodesPath, "utf-8");
  const TAX_CODES: TaxCodeData[] = JSON.parse(taxCodesRaw);
  
  console.log(`Found ${TAX_CODES.length} TaxCodes...`);
  
  const existingTaxCodeCount = await prisma.taxCode.count();
  if (existingTaxCodeCount >= TAX_CODES.length) {
    console.log(`TaxCodes already complete (${existingTaxCodeCount} entries), skipping...`);
  } else {
    console.log(existingTaxCodeCount > 0 
      ? `Resuming TaxCode seed (${existingTaxCodeCount} exist, need ${TAX_CODES.length})...`
      : "Seeding TaxCodes in batches...");
    const batchSize = 100;
    for (let i = 0; i < TAX_CODES.length; i += batchSize) {
      const batch = TAX_CODES.slice(i, i + batchSize);
      await prisma.taxCode.createMany({
        data: batch,
        skipDuplicates: true,
      });
      console.log(`Processed ${Math.min(i + batchSize, TAX_CODES.length)} / ${TAX_CODES.length} TaxCodes`);
    }
    const finalCount = await prisma.taxCode.count();
    console.log(`TaxCodes complete: ${finalCount} entries`);
  }

  console.log("Seeding StaffingRates...");
  for (const sr of STAFFING_RATES) {
    await prisma.staffingRate.upsert({
      where: { roleName: sr.roleName },
      update: sr,
      create: sr,
    });
  }
  console.log(`Seeded ${STAFFING_RATES.length} StaffingRates`);

  await fixLegacyProofStatuses();
  await backfillAssetCodes();

  console.log("Reference data seeding complete!");
}

async function fixLegacyProofStatuses() {
  try {
    const result1 = await prisma.$executeRaw`UPDATE "ProofRequest" SET status = 'CLIENT_REVIEW' WHERE status = 'PENDING_REVIEW'`;
    const result2 = await prisma.$executeRaw`UPDATE "ProofRequest" SET status = 'REVISIONS_NEEDED' WHERE status = 'REVISION_REQUESTED'`;
    if (result1 > 0 || result2 > 0) {
      console.log(`Converted legacy proof statuses: ${result1} PENDING_REVIEW → CLIENT_REVIEW, ${result2} REVISION_REQUESTED → REVISIONS_NEEDED`);
    }
  } catch (e) {
    // Table may not exist yet on first deploy
  }
}

async function backfillAssetCodes() {
  try {
    const assets = await prisma.asset.findMany({
      where: { assetCode: null },
      select: { id: true },
    });
    if (assets.length === 0) return;
    const crypto = await import("crypto");
    for (const asset of assets) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 8);
      await prisma.asset.update({ where: { id: asset.id }, data: { assetCode: code } });
    }
    console.log(`Backfilled asset codes for ${assets.length} assets`);
  } catch (e) {
    // Table may not exist yet
  }
}

main()
  .catch((e) => {
    console.error("Error seeding reference data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
