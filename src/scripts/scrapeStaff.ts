// CLI: npm run scrape:staff -- --school-id 12
// Scrapes the staff directory page for one school (staff_directory_url must be set).
import { scrapeSchoolStaff } from "../sync/staffDirectory.js";

const idArg = process.argv.indexOf("--school-id");
if (idArg === -1) {
  console.error("Usage: npm run scrape:staff -- --school-id <id>");
  process.exit(1);
}
const schoolId = Number(process.argv[idArg + 1]);
const count = await scrapeSchoolStaff(schoolId);
console.log(`Upserted ${count} coaches for school ${schoolId}`);
