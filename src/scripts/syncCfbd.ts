// CLI: npm run sync:cfbd [-- --year 2026]
import { syncSchools, syncHeadCoaches } from "../sync/cfbd.js";

const yearArg = process.argv.indexOf("--year");
const year = yearArg > -1 ? Number(process.argv[yearArg + 1]) : new Date().getFullYear();

const schools = await syncSchools(year);
console.log(`Synced ${schools} schools for ${year}`);
const coaches = await syncHeadCoaches(year);
console.log(`Synced ${coaches} head coaches for ${year}`);
