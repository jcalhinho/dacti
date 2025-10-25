// Unified cloud caller with optional proxy support. No API keys hardcoded in bundle.
// Settings stored in chrome.storage.local:
//  - dactiCloudEnabled: boolean (defaults to true)
//  - dactiCloudMode: 'proxy' | 'userkey'
//  - dactiProxyUrl: string (e.g., https://your-proxy.example.com)
//  - dactiProxyToken: string (optional bearer token for proxy)
//  - dactiUserApiKey: string (user-provided Gemini API key)

type CloudConfig = {
  enabled: boolean;
  mode: 'proxy' | 'userkey' | '';
  proxyUrl: string;
  proxyToken: string;
  userApiKey: string;
};

async function getCloudConfig(): Promise<CloudConfig> {
  const values = await chrome.storage.local.get([
    'dactiCloudEnabled',
    'dactiCloudMode',
    'dactiProxyUrl',
    'dactiProxyToken',
    'dactiUserApiKey',
    // Back-compatibility keys
    'dactiProxyURL',
    'proxyUrl',
    'PROXY_URL',
    'proxyToken',
    'PROXY_TOKEN',
  ]);

  const config: CloudConfig = {
    enabled: typeof values.dactiCloudEnabled === 'boolean' ? values.dactiCloudEnabled : true,
    mode: '',
    proxyUrl: [
      values.dactiProxyUrl,
      values.dactiProxyURL,
      values.proxyUrl,
      values.PROXY_URL,
    ].find(v => typeof v === 'string' && v.trim())?.trim() || '',
    proxyToken: [
      values.dactiProxyToken,
      values.proxyToken,
      values.PROXY_TOKEN,
    ].find(v => typeof v === 'string' && v.trim())?.trim() || '',
    userApiKey: typeof values.dactiUserApiKey === 'string' ? values.dactiUserApiKey.trim() : '',
  };

  if (values.dactiCloudMode === 'proxy' || values.dactiCloudMode === 'userkey') {
    config.mode = values.dactiCloudMode;
  } else if (config.proxyUrl) {
    config.mode = 'proxy';
  } else if (config.userApiKey) {
    config.mode = 'userkey';
  }

  return config;
}

async function callProxy(config: CloudConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  if (!config.proxyUrl) {
    throw new Error('Cloud proxy URL is not configured.');
  }
  const url = config.proxyUrl.replace(/\/$/, '') + '/generate';
  const extId = chrome.runtime?.id || '';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.proxyToken && { 'Authorization': `Bearer ${config.proxyToken}` }),
      ...(extId && { 'x-dacti-ext-id': extId }),
    },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Proxy error ${response.status}: ${errorBody}`);
  }

  const data = await response.json().catch(() => ({}));
  const text = data?.text ?? data?.output ?? data?.result ?? '';
  if (!text) {
    throw new Error('Proxy returned no text.');
  }
  return String(text);
}

async function callUserKeyApi(config: CloudConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  if (!config.userApiKey) {
    throw new Error('Gemini API key is not configured.');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${encodeURIComponent(config.userApiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) {
    return String(text);
  }
  if (data?.promptFeedback?.blockReason) {
    throw new Error(`Request blocked by API: ${data.promptFeedback.blockReason}`);
  }
  throw new Error('Gemini API returned no content.');
}

export async function callGeminiApi(prompt: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  const config = await getCloudConfig();

  if (!config.enabled) {
    throw new Error('Cloud fallback is disabled in settings.');
  }

  if (config.mode === 'proxy') {
    return callProxy(config, prompt, options.signal);
  }

  if (config.mode === 'userkey') {
    return callUserKeyApi(config, prompt, options.signal);
  }

  throw new Error('Cloud fallback is not configured. Please set a proxy URL or a user API key in the extension settings.');
}
