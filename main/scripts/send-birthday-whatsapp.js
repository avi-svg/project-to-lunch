const { loadEnvFile } = require('../lib/load-env');
const { sendBirthdayAnnouncementsForDate } = require('../lib/birthday-whatsapp');

loadEnvFile();

function parseDateArg(value) {
  if (!value) {
    return new Date();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must be in YYYY-MM-DD format.');
  }

  return new Date(`${value}T12:00:00.000Z`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dateArg = args.find((value) => value !== '--force');
  const date = parseDateArg(dateArg);

  const result = await sendBirthdayAnnouncementsForDate({
    date,
    force,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
