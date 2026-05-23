function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required ${name} environment variable.`);
  }

  return value;
}

function getWhatsAppConfig() {
  return {
    accessToken: getRequiredEnv('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: getRequiredEnv('WHATSAPP_PHONE_NUMBER_ID'),
    apiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0',
  };
}

async function performWhatsAppRequest(payload) {
  const { accessToken, phoneNumberId, apiVersion } = getWhatsAppConfig();
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const responseText = await response.text();
  let parsedPayload = null;

  if (responseText) {
    try {
      parsedPayload = JSON.parse(responseText);
    } catch (error) {
      parsedPayload = {
        raw: responseText,
      };
    }
  }

  if (!response.ok) {
    const details =
      parsedPayload && parsedPayload.error && parsedPayload.error.message
        ? parsedPayload.error.message
        : responseText || 'Unknown WhatsApp API error.';

    const failure = new Error(
      `WhatsApp API request failed with status ${response.status}: ${details}`
    );
    failure.status = response.status;
    failure.payload = parsedPayload;
    throw failure;
  }

  return parsedPayload;
}

function normalizeWhatsAppRecipient(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const digitsOnly = String(value).replace(/\D/g, '');

  if (!digitsOnly) {
    return null;
  }

  let normalized = digitsOnly;

  if (normalized.startsWith('00')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('0')) {
    const defaultCountryCode = String(
      process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '972'
    ).replace(/\D/g, '');

    if (!defaultCountryCode) {
      return null;
    }

    normalized = `${defaultCountryCode}${normalized.slice(1)}`;
  }

  if (!/^\d{8,15}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

async function sendWhatsAppText({ to, body, previewUrl = false }) {
  if (!to || !body) {
    throw new Error('Both "to" and "body" are required to send a WhatsApp message.');
  }

  const normalizedRecipient = normalizeWhatsAppRecipient(to);

  if (!normalizedRecipient) {
    throw new Error('Recipient phone number is missing or invalid for WhatsApp.');
  }

  return performWhatsAppRequest({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedRecipient,
    type: 'text',
    text: {
      preview_url: previewUrl,
      body,
    },
  });
}

async function sendWhatsAppTemplate({
  to,
  name,
  languageCode,
  bodyParameters = [],
}) {
  if (!to || !name || !languageCode) {
    throw new Error(
      'The "to", "name", and "languageCode" fields are required to send a WhatsApp template message.'
    );
  }

  const normalizedRecipient = normalizeWhatsAppRecipient(to);

  if (!normalizedRecipient) {
    throw new Error('Recipient phone number is missing or invalid for WhatsApp.');
  }

  return performWhatsAppRequest({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedRecipient,
    type: 'template',
    template: {
      name,
      language: {
        code: languageCode,
      },
      components:
        bodyParameters.length > 0
          ? [
              {
                type: 'body',
                parameters: bodyParameters.map((parameter) => ({
                  type: 'text',
                  text: String(parameter ?? ''),
                })),
              },
            ]
          : undefined,
    },
  });
}

module.exports = {
  normalizeWhatsAppRecipient,
  sendWhatsAppTemplate,
  sendWhatsAppText,
};
