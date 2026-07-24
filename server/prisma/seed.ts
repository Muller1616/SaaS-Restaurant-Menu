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

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  console.log("Seeding KitchenOS database...");

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

  const adminEmail = process.env.ADMIN_EMAIL ?? "simbatechtradingplc@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    if (isProduction) {
      throw new Error("ADMIN_PASSWORD is required when seeding in production");
    }
  }
  const resolvedAdminPassword = adminPassword ?? "Admin@12345";
  const adminName = process.env.ADMIN_NAME ?? "KitchenOS Admin";
  const passwordHash = await bcrypt.hash(resolvedAdminPassword, 10);

  // Keep a single super-admin aligned with ADMIN_* from .env (migrate email if it changed).
  const envAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
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
        passwordHash,
        role: "SUPER_ADMIN",
      },
    });
    if (legacyAdmin && legacyAdmin.id !== envAdmin.id) {
      await prisma.adminPasswordOtp.deleteMany({ where: { adminId: legacyAdmin.id } });
      await prisma.adminUser.delete({ where: { id: legacyAdmin.id } });
    }
  } else if (legacyAdmin) {
    await prisma.adminUser.update({
      where: { id: legacyAdmin.id },
      data: {
        email: adminEmail,
        name: adminName,
        passwordHash,
        role: "SUPER_ADMIN",
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

  const staffEmail =
    process.env.STAFF_ADMIN_EMAIL ?? "staff@kitchenos.local";
  const staffPasswordEnv = process.env.STAFF_ADMIN_PASSWORD;
  if (!staffPasswordEnv && isProduction) {
    throw new Error("STAFF_ADMIN_PASSWORD is required when seeding in production");
  }
  const staffPassword = staffPasswordEnv ?? "Staff@12345";
  const staffName = process.env.STAFF_ADMIN_NAME ?? "KitchenOS Staff";
  const staffHash = await bcrypt.hash(staffPassword, 10);

  await prisma.adminUser.upsert({
    where: { email: staffEmail },
    update: {
      name: staffName,
      passwordHash: staffHash,
      role: "ADMIN",
    },
    create: {
      name: staffName,
      email: staffEmail,
      passwordHash: staffHash,
      role: "ADMIN",
    },
  });

  const planCount = await prisma.plan.count();
  const adminCount = await prisma.adminUser.count();

  console.log(`Seed complete: ${planCount} plans, ${adminCount} admin user(s).`);
  console.log(`Super admin email: ${adminEmail}`);
  console.log(`Staff admin email:  ${staffEmail}`);
  if (!isProduction) {
    console.log(
      "Dev note: passwords are taken from ADMIN_PASSWORD / STAFF_ADMIN_PASSWORD in .env (defaults only if unset).",
    );
  }
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
