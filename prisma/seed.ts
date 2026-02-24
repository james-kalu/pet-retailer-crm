import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// Helper: store stringified JSON arrays (since SQLite + Prisma JSON type isn't working in this setup)
function jarr(values: string[]): string {
  return JSON.stringify(values);
}

async function main() {
  await prisma.activity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.retailer.deleteMany();

  const retailers = [
    {
      name: "Paws & Pantry",
      city: "Austin",
      region: "TX",
      stage: "LEAD_IDENTIFIED",
      tags: jarr(["independent", "urban"]),
      products_carried: jarr([]),
      support_needed: jarr([]),
      blocker: "AWARENESS",
      notes: "Found via neighborhood retailer association."
    },
    {
      name: "Happy Tail Market",
      city: "Denver",
      region: "CO",
      stage: "CONTACTED",
      tags: jarr(["natural"]),
      products_carried: jarr([]),
      support_needed: jarr([]),
      notes: "Intro call completed; waiting for product sheet review."
    },
    {
      name: "Barkin' Boutique",
      city: "Portland",
      region: "OR",
      stage: "SAMPLES_SENT",
      tags: jarr(["premium"]),
      products_carried: jarr([]),
      support_needed: jarr(["Samples"]),
      notes: "Owner requested trial packs for picky eaters."
    },
    {
      name: "Fetch Feed & Supply",
      city: "Nashville",
      region: "TN",
      stage: "WON_FIRST_PO_PLACED",
      first_order_date: daysAgo(21),
      last_order_date: daysAgo(21),
      tags: jarr(["suburban", "grooming"]),
      products_carried: jarr(["Chicken Formula", "Salmon Formula"]),
      support_needed: jarr(["Training"]),
      notes: "First PO delivered; staff onboarding still pending."
    },
    {
      name: "Neighborhood Pet Collective",
      city: "Seattle",
      region: "WA",
      stage: "SLOW_SELL_THROUGH",
      first_order_date: daysAgo(120),
      last_order_date: daysAgo(67),
      tags: jarr(["community"]),
      products_carried: jarr(["Puppy Blend", "Senior Blend"]),
      blocker: "WRONG_SKU_MIX",
      support_needed: jarr(["Training", "Signage", "In-store sampling"]),
      notes: "Sell-through slowed after initial launch month."
    },
    {
      name: "Urban Leash Co-op",
      city: "Chicago",
      region: "IL",
      stage: "DORMANT",
      first_order_date: daysAgo(220),
      last_order_date: daysAgo(95),
      tags: jarr(["co-op"]),
      products_carried: jarr(["Chicken Formula"]),
      support_needed: jarr(["Reorder check-in"]),
      notes: "No reorder since last quarter."
    },
    {
      name: "K9 Corner",
      city: "Phoenix",
      region: "AZ",
      stage: "INTERESTED_NEEDS_INFO",
      tags: jarr(["new prospect"]),
      products_carried: jarr([]),
      support_needed: jarr(["Digital assets"]),
      notes: "Interested in margin comparison."
    },
    {
      name: "Pet Haven Grocer",
      city: "Miami",
      region: "FL",
      stage: "ONBOARDING_NEEDED",
      first_order_date: daysAgo(12),
      last_order_date: daysAgo(12),
      tags: jarr(["high foot traffic"]),
      products_carried: jarr(["Salmon Formula", "Turkey Formula"]),
      support_needed: jarr(["Visit", "Signage"]),
      notes: "Great launch potential with demo event."
    }
  ];

  for (const retailerData of retailers) {
    const retailer = await prisma.retailer.create({ data: retailerData });

    // Only create an initial activity once we've moved beyond the first stage
    if (retailer.stage === "LEAD_IDENTIFIED") continue;

    await prisma.activity.create({
      data: {
        retailer_id: retailer.id,
        type: "NOTE",
        summary: `Retailer created in stage ${retailer.stage}.`
      }
    });
  }

  const allRetailers = await prisma.retailer.findMany({ orderBy: { id: "asc" } });
  const byName = Object.fromEntries(allRetailers.map((r) => [r.name, r.id]));

  await prisma.task.createMany({
    data: [
      {
        retailer_id: byName["Happy Tail Market"],
        title: "Follow up on intro deck",
        action_type: "CALL",
        due_date: daysFromNow(0),
        status: "OPEN"
      },
      {
        retailer_id: byName["Barkin' Boutique"],
        title: "Check sample feedback",
        action_type: "CALL",
        due_date: daysFromNow(2),
        status: "OPEN"
      },
      {
        retailer_id: byName["Neighborhood Pet Collective"],
        title: "Review shelf placement + conversion",
        action_type: "VISIT",
        due_date: daysFromNow(-1),
        status: "OPEN"
      },
      {
        retailer_id: byName["Urban Leash Co-op"],
        title: "Reactivation reorder ask",
        action_type: "REORDER_ASK",
        due_date: daysFromNow(-3),
        status: "OPEN"
      },
      {
        retailer_id: byName["Pet Haven Grocer"],
        title: "Staff product knowledge training",
        action_type: "TRAINING",
        due_date: daysFromNow(1),
        status: "OPEN"
      }
    ]
  });

  await prisma.activity.createMany({
    data: [
      {
        retailer_id: byName["Neighborhood Pet Collective"],
        type: "VISIT",
        summary: "Visited store; low shelf visibility near checkout."
      },
      {
        retailer_id: byName["Neighborhood Pet Collective"],
        type: "CALL",
        summary: "Manager requested signage and sampling event support."
      },
      {
        retailer_id: byName["Fetch Feed & Supply"],
        type: "EMAIL",
        summary: "Sent onboarding checklist and reorder cadence guide."
      },
      {
        retailer_id: byName["Urban Leash Co-op"],
        type: "CALL",
        summary: "Buyer changed; requested updated price list."
      }
    ]
  });

  const sixtyDaysAgo = daysAgo(60);
  await prisma.retailer.updateMany({
    where: {
      stage: { not: "LOST_NOT_A_FIT" },
      last_order_date: { lt: sixtyDaysAgo }
    },
    data: { is_at_risk: true }
  });

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
