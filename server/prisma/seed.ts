import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const plans: Array<{
  name: string;
  slug: string;
  priceMonthly: Prisma.Decimal;
  maxBranches: number;
  maxItems: number | null;
  features: Prisma.InputJsonValue;
}> = [
  {
    name: "Free",
    slug: "free",
    priceMonthly: new Prisma.Decimal(0),
    maxBranches: 1,
    maxItems: 20,
    features: {
      customQr: false,
      analytics: "none",
      support: "email",
    },
  },
  {
    name: "Basic",
    slug: "basic",
    priceMonthly: new Prisma.Decimal(500),
    maxBranches: 1,
    maxItems: 50,
    features: {
      customQr: true,
      analytics: "basic",
      support: "email",
    },
  },
  {
    name: "Popular",
    slug: "popular",
    priceMonthly: new Prisma.Decimal(1500),
    maxBranches: 3,
    maxItems: null,
    features: {
      customQr: true,
      analytics: "full",
      support: "priority",
    },
  },
  {
    name: "Premium",
    slug: "premium",
    priceMonthly: new Prisma.Decimal(3000),
    maxBranches: -1,
    maxItems: null,
    features: {
      customQr: true,
      analytics: "full",
      support: "priority",
    },
  },
];

async function seedPlans() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        maxBranches: plan.maxBranches,
        maxItems: plan.maxItems,
        features: plan.features,
        isActive: true,
      },
      create: plan,
    });
  }
}

/**
 * Bootstrap / update platform admins from env.
 * Production: refuses unless ALLOW_PROD_SEED=1 and all credentials are explicit.
 * Never resets an existing admin password unless SEED_RESET_ADMIN_PASSWORDS=1.
 */
async function seedAdmins(isProduction: boolean) {
  if (isProduction && process.env.ALLOW_PROD_SEED !== "1") {
    console.log(
      "Skipping admin seed in production (set ALLOW_PROD_SEED=1 to bootstrap explicitly).",
    );
    return;
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME ?? "KitchenOS Admin";

  if (!adminEmail || !adminPassword) {
    if (isProduction) {
      throw new Error(
        "ADMIN_EMAIL and ADMIN_PASSWORD are required when ALLOW_PROD_SEED=1",
      );
    }
    console.log(
      "Skipping super-admin seed (set ADMIN_EMAIL and ADMIN_PASSWORD in .env).",
    );
  } else {
    const resetPasswords = process.env.SEED_RESET_ADMIN_PASSWORDS === "1";
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const envAdmin = await prisma.adminUser.findUnique({
      where: { email: adminEmail },
    });
    const legacyAdmin =
      adminEmail !== "admin@kitchenos.local"
        ? await prisma.adminUser.findUnique({
            where: { email: "admin@kitchenos.local" },
          })
        : null;

    if (envAdmin) {
      await prisma.adminUser.update({
        where: { id: envAdmin.id },
        data: {
          name: adminName,
          role: "SUPER_ADMIN",
          ...(resetPasswords || !envAdmin.passwordHash
            ? { passwordHash }
            : {}),
        },
      });
      if (legacyAdmin && legacyAdmin.id !== envAdmin.id) {
        await prisma.adminPasswordOtp.deleteMany({
          where: { adminId: legacyAdmin.id },
        });
        await prisma.adminUser.delete({ where: { id: legacyAdmin.id } });
      }
    } else if (legacyAdmin) {
      await prisma.adminUser.update({
        where: { id: legacyAdmin.id },
        data: {
          email: adminEmail,
          name: adminName,
          role: "SUPER_ADMIN",
          ...(resetPasswords ? { passwordHash } : {}),
          ...(!legacyAdmin.passwordHash ? { passwordHash } : {}),
        },
      });
    } else {
      await prisma.adminUser.create({
        data: {
          name: adminName,
          email: adminEmail,
          passwordHash,
          role: "SUPER_ADMIN",
        },
      });
    }
    console.log(`Super admin ready: ${adminEmail}`);
  }

  const staffEmail = (process.env.STAFF_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const staffPassword = process.env.STAFF_ADMIN_PASSWORD;
  const staffName = process.env.STAFF_ADMIN_NAME ?? "KitchenOS Staff";

  if (!staffEmail || !staffPassword) {
    if (isProduction) {
      throw new Error(
        "STAFF_ADMIN_EMAIL and STAFF_ADMIN_PASSWORD are required when ALLOW_PROD_SEED=1",
      );
    }
    console.log(
      "Skipping staff-admin seed (set STAFF_ADMIN_EMAIL and STAFF_ADMIN_PASSWORD to create one).",
    );
    return;
  }

  const resetPasswords = process.env.SEED_RESET_ADMIN_PASSWORDS === "1";
  const staffHash = await bcrypt.hash(staffPassword, 12);
  const existingStaff = await prisma.adminUser.findUnique({
    where: { email: staffEmail },
  });

  if (existingStaff) {
    await prisma.adminUser.update({
      where: { id: existingStaff.id },
      data: {
        name: staffName,
        role: "ADMIN",
        ...(resetPasswords || !existingStaff.passwordHash
          ? { passwordHash: staffHash }
          : {}),
      },
    });
  } else {
    await prisma.adminUser.create({
      data: {
        name: staffName,
        email: staffEmail,
        passwordHash: staffHash,
        role: "ADMIN",
      },
    });
  }
  console.log(`Staff admin ready: ${staffEmail}`);
}

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  console.log("Seeding KitchenOS database...");

  await seedPlans();
  await seedAdmins(isProduction);

  const planCount = await prisma.plan.count();
  const adminCount = await prisma.adminUser.count();
  console.log(`Seed complete: ${planCount} plans, ${adminCount} admin user(s).`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
