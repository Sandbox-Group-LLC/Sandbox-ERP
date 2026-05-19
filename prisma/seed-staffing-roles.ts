import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  console.log("Seeding StaffingRoles and RoleRates...");

  // Get all organizations
  const organizations = await prisma.organization.findMany();

  if (organizations.length === 0) {
    console.error("No organizations found. Please run the main seed script first.");
    process.exit(1);
  }

  for (const organization of organizations) {
    for (const sr of STAFFING_RATES) {
      // Upsert StaffingRole
      const staffingRole = await prisma.staffingRole.upsert({
        where: {
          organizationId_name: {
            organizationId: organization.id,
            name: sr.roleName,
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          name: sr.roleName,
        },
      });

      // Upsert RoleRate
      await prisma.roleRate.upsert({
        where: {
          roleId: staffingRole.id,
        },
        update: {
          internalRate: sr.internalRate,
          organizationId: organization.id,
        },
        create: {
          roleId: staffingRole.id,
          internalRate: sr.internalRate,
          organizationId: organization.id,
        },
      });
    }
    console.log(`Seeded ${STAFFING_RATES.length} StaffingRoles and RoleRates for ${organization.name}`);
  }

  console.log("Staffing role seed data complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
