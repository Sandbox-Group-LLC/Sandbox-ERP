import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

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
  console.log("Loading TaxCodes from JSON...");
  const taxCodesPath = path.join(__dirname, "tax-codes-data.json");
  const taxCodesRaw = fs.readFileSync(taxCodesPath, "utf-8");
  const TAX_CODES: TaxCodeData[] = JSON.parse(taxCodesRaw);
  
  console.log(`Found ${TAX_CODES.length} TaxCodes to seed...`);
  
  console.log("Clearing existing TaxCodes...");
  await prisma.taxCode.deleteMany({});
  
  console.log("Seeding TaxCodes in batches...");
  const batchSize = 100;
  for (let i = 0; i < TAX_CODES.length; i += batchSize) {
    const batch = TAX_CODES.slice(i, i + batchSize);
    await prisma.taxCode.createMany({
      data: batch,
    });
    console.log(`Seeded ${Math.min(i + batchSize, TAX_CODES.length)} / ${TAX_CODES.length} TaxCodes`);
  }
  console.log(`Seeded ${TAX_CODES.length} TaxCodes`);

  console.log("Seeding StaffingRates...");
  for (const sr of STAFFING_RATES) {
    await prisma.staffingRate.upsert({
      where: { roleName: sr.roleName },
      update: sr,
      create: sr,
    });
  }
  console.log(`Seeded ${STAFFING_RATES.length} StaffingRates`);

  console.log("Budget seed data complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
