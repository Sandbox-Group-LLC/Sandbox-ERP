import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { addDays } from "date-fns"
import crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const prisma = new PrismaClient()

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

async function seedBudgetData() {
  console.log("Loading TaxCodes from JSON...");
  const taxCodesPath = path.join(__dirname, "tax-codes-data.json");
  const taxCodesRaw = fs.readFileSync(taxCodesPath, "utf-8");
  const TAX_CODES: TaxCodeData[] = JSON.parse(taxCodesRaw);
  
  console.log(`Found ${TAX_CODES.length} TaxCodes to seed...`);
  
  const existingCount = await prisma.taxCode.count();
  if (existingCount > 0) {
    console.log(`TaxCodes already exist (${existingCount} entries), skipping...`);
  } else {
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

  console.log("Budget seed data complete!");
}

async function main() {
  console.log("Seeding database...")

  const passwordHash = await bcrypt.hash("demo123", 10)

  const org = await prisma.organization.create({
    data: {
      name: "Demo Event Agency",
    },
  })

  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: "demo@sandbox-erp.com",
      name: "Demo User",
      passwordHash,
      organizationId: org.id,
    },
  })

  console.log("Created demo user: demo@sandbox-erp.com / demo123")

  const clients = await Promise.all([
    prisma.client.create({
      data: {
        name: "Acme Corporation",
        notes: "Large enterprise client with multiple annual events",
        organizationId: org.id,
        contacts: {
          create: [
            { name: "John Smith", email: "john@acme.com", role: "Event Director" },
            { name: "Sarah Johnson", email: "sarah@acme.com", role: "Marketing VP" },
          ],
        },
      },
    }),
    prisma.client.create({
      data: {
        name: "TechStart Inc",
        notes: "Growing startup, focus on tech conferences",
        organizationId: org.id,
        contacts: {
          create: [
            { name: "Mike Chen", email: "mike@techstart.io", role: "CEO" },
          ],
        },
      },
    }),
    prisma.client.create({
      data: {
        name: "Global Finance Group",
        notes: "Conservative style, formal galas preferred",
        organizationId: org.id,
        contacts: {
          create: [
            { name: "Emily Davis", email: "emily@gfg.com", role: "VP Operations" },
            { name: "Robert Brown", email: "robert@gfg.com", role: "Event Coordinator" },
          ],
        },
      },
    }),
  ])

  const vendors = await Promise.all([
    prisma.vendor.create({
      data: { name: "Premier AV Solutions", email: "sales@premierav.com", categories: "AV, Lighting", organizationId: org.id },
    }),
    prisma.vendor.create({
      data: { name: "Gourmet Catering Co", email: "events@gourmetcatering.com", categories: "Catering, F&B", organizationId: org.id },
    }),
    prisma.vendor.create({
      data: { name: "Event Decor Plus", email: "design@eventdecor.com", categories: "Decor, Floral", organizationId: org.id },
    }),
    prisma.vendor.create({
      data: { name: "TechRental Pro", email: "rentals@techrental.com", categories: "Equipment, IT", organizationId: org.id },
    }),
  ])

  const people = await Promise.all([
    prisma.person.create({
      data: { name: "Alex Thompson", type: "Employee", email: "alex@agency.com", defaultCostRate: 400, defaultBillRate: 800, organizationId: org.id },
    }),
    prisma.person.create({
      data: { name: "Jamie Wilson", type: "Employee", email: "jamie@agency.com", defaultCostRate: 350, defaultBillRate: 700, organizationId: org.id },
    }),
    prisma.person.create({
      data: { name: "Chris Martinez", type: "Freelancer", email: "chris@freelance.com", defaultCostRate: 500, defaultBillRate: 1000, organizationId: org.id },
    }),
    prisma.person.create({
      data: { name: "Pat O'Brien", type: "Freelancer", email: "pat@contractor.com", defaultCostRate: 300, defaultBillRate: 600, organizationId: org.id },
    }),
  ])

  const template = await prisma.template.create({
    data: {
      name: "Corporate Conference",
      eventType: "Conference",
      organizationId: org.id,
      tasks: {
        create: [
          { title: "Initial client briefing", milestone: "Pre-Production", offsetDaysFromStart: -30, defaultOwnerRole: "Project Manager" },
          { title: "Venue site visit", milestone: "Pre-Production", offsetDaysFromStart: -28, defaultOwnerRole: "Project Manager" },
          { title: "AV requirements document", milestone: "Pre-Production", offsetDaysFromStart: -25 },
          { title: "Catering menu selection", milestone: "Pre-Production", offsetDaysFromStart: -21 },
          { title: "Send vendor RFPs", milestone: "Pre-Production", offsetDaysFromStart: -20 },
          { title: "Review vendor quotes", milestone: "Pre-Production", offsetDaysFromStart: -14 },
          { title: "Finalize vendor contracts", milestone: "Pre-Production", offsetDaysFromStart: -10 },
          { title: "Create run of show", milestone: "Production", offsetDaysFromStart: -7 },
          { title: "Staff briefing meeting", milestone: "Production", offsetDaysFromStart: -3 },
          { title: "Load-in coordination", milestone: "Onsite", offsetDaysFromStart: -1 },
          { title: "Technical rehearsal", milestone: "Onsite", offsetDaysFromStart: 0 },
          { title: "Event execution", milestone: "Onsite", offsetDaysFromStart: 1 },
          { title: "Load-out supervision", milestone: "Post-Event", offsetDaysFromStart: 2 },
          { title: "Client debrief", milestone: "Post-Event", offsetDaysFromStart: 5 },
          { title: "Final invoicing", milestone: "Post-Event", offsetDaysFromStart: 7 },
        ],
      },
    },
  })

  await prisma.template.create({
    data: {
      name: "Corporate Gala",
      eventType: "Gala",
      organizationId: org.id,
      tasks: {
        create: [
          { title: "Theme development meeting", milestone: "Concept", offsetDaysFromStart: -45 },
          { title: "Venue selection", milestone: "Concept", offsetDaysFromStart: -40 },
          { title: "Entertainment sourcing", milestone: "Pre-Production", offsetDaysFromStart: -35 },
          { title: "Decor concept approval", milestone: "Pre-Production", offsetDaysFromStart: -30 },
          { title: "Menu tasting", milestone: "Pre-Production", offsetDaysFromStart: -21 },
          { title: "RSVP tracking", milestone: "Production", offsetDaysFromStart: -14 },
          { title: "Seating chart", milestone: "Production", offsetDaysFromStart: -5 },
          { title: "Event execution", milestone: "Onsite", offsetDaysFromStart: 0 },
        ],
      },
    },
  })

  const opportunity = await prisma.opportunity.create({
    data: {
      clientId: clients[0].id,
      organizationId: org.id,
      stage: "Qualified",
      eventType: "Annual Conference",
      budgetRange: "$150k-200k",
      targetStartDate: addDays(new Date(), 60),
      notes: "Annual company conference for 500 attendees",
    },
  })

  await prisma.opportunity.create({
    data: {
      clientId: clients[1].id,
      organizationId: org.id,
      stage: "Lead",
      eventType: "Product Launch",
      budgetRange: "$75k-100k",
      targetStartDate: addDays(new Date(), 90),
    },
  })

  const project = await prisma.project.create({
    data: {
      name: "Acme Annual Gala 2026",
      clientId: clients[0].id,
      organizationId: org.id,
      eventType: "Gala",
      city: "San Francisco",
      venue: "The Grand Ballroom",
      startDate: addDays(new Date(), 45),
      endDate: addDays(new Date(), 46),
      status: "Active",
      ownerUserId: user.id,
    },
  })

  const estimateVersion = await prisma.estimateVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      status: "Approved",
      lineItems: {
        create: [
          { category: "Venue", description: "Venue rental fee", qty: 1, unitCost: 25000, pricingMode: "Markup", markupPercent: 15, revenue: 28750 },
          { category: "AV", description: "Audio visual package", qty: 1, unitCost: 18000, vendorId: vendors[0].id, pricingMode: "Markup", markupPercent: 20, revenue: 21600 },
          { category: "Catering", description: "Dinner service (150 guests)", qty: 150, unitCost: 125, vendorId: vendors[1].id, pricingMode: "Markup", markupPercent: 18, revenue: 22125 },
          { category: "Decor", description: "Floral arrangements & decor", qty: 1, unitCost: 12000, vendorId: vendors[2].id, pricingMode: "Markup", markupPercent: 25, revenue: 15000 },
          { category: "Entertainment", description: "Live band (4 hours)", qty: 1, unitCost: 8000, pricingMode: "PassThrough", revenue: 8000 },
          { category: "Management", description: "Project management fee", qty: 1, unitCost: 0, pricingMode: "Fixed", revenue: 15000 },
        ],
      },
    },
  })

  const milestones = await Promise.all([
    prisma.milestone.create({ data: { projectId: project.id, title: "Pre-Production", sortOrder: 0 } }),
    prisma.milestone.create({ data: { projectId: project.id, title: "Onsite", sortOrder: 1 } }),
    prisma.milestone.create({ data: { projectId: project.id, title: "Post-Event", sortOrder: 2 } }),
  ])

  await prisma.task.createMany({
    data: [
      { projectId: project.id, milestoneId: milestones[0].id, title: "Finalize guest list", status: "Done", dueDate: addDays(new Date(), 10), ownerUserId: user.id },
      { projectId: project.id, milestoneId: milestones[0].id, title: "Confirm vendors", status: "Done", dueDate: addDays(new Date(), 15) },
      { projectId: project.id, milestoneId: milestones[0].id, title: "Create run of show", status: "InProgress", dueDate: addDays(new Date(), 25), ownerUserId: user.id },
      { projectId: project.id, milestoneId: milestones[0].id, title: "Send staff schedule", status: "Todo", dueDate: addDays(new Date(), 30) },
      { projectId: project.id, milestoneId: milestones[1].id, title: "Load-in supervision", status: "Todo", dueDate: addDays(new Date(), 44) },
      { projectId: project.id, milestoneId: milestones[1].id, title: "Event execution", status: "Todo", dueDate: addDays(new Date(), 45) },
      { projectId: project.id, milestoneId: milestones[2].id, title: "Client debrief", status: "Todo", dueDate: addDays(new Date(), 50) },
      { projectId: project.id, milestoneId: milestones[2].id, title: "Final invoicing", status: "Todo", dueDate: addDays(new Date(), 52) },
    ],
  })

  await prisma.vendorQuote.createMany({
    data: [
      { projectId: project.id, vendorId: vendors[0].id, amount: 18000, status: "Selected", notes: "Full AV package with LED walls" },
      { projectId: project.id, vendorId: vendors[1].id, amount: 18750, status: "Selected", notes: "3-course dinner with premium wine pairing" },
      { projectId: project.id, vendorId: vendors[2].id, amount: 12000, status: "Selected", notes: "Elegant white floral theme" },
    ],
  })

  await prisma.purchase.createMany({
    data: [
      { projectId: project.id, vendorId: vendors[0].id, description: "AV Package - 50% deposit", amount: 9000, status: "Paid" },
      { projectId: project.id, vendorId: vendors[1].id, description: "Catering deposit", amount: 5000, status: "Approved" },
      { projectId: project.id, vendorId: vendors[2].id, description: "Decor materials", amount: 4000, status: "Approved" },
    ],
  })

  await seedBudgetData()

  console.log("Database seeded successfully!")
  console.log("\nDemo credentials:")
  console.log("  Email: demo@sandbox-erp.com")
  console.log("  Password: demo123")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
