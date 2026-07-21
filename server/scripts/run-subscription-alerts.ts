import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { runSubscriptionAlertJob } from "../src/jobs/subscription-alerts.js";

async function main() {
  await prisma.$connect();
  const result = await runSubscriptionAlertJob();
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
