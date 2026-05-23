const { loadEnvFile } = require('../lib/load-env');
const { sendWhatsAppText } = require('../lib/whatsapp');

loadEnvFile();

async function main() {
  const [, , to, ...messageParts] = process.argv;

  if (!to) {
    console.error(
      'Usage: npm run whatsapp:test -- <recipient-phone> [message text]'
    );
    process.exit(1);
  }

  const body =
    messageParts.join(' ').trim() ||
    'Test message from projects-to-lunch via WhatsApp Cloud API.';

  const result = await sendWhatsAppText({
    to,
    body,
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        to,
        body,
        result,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);

  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }

  process.exit(1);
});
