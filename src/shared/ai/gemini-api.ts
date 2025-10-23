const API_KEY = 'METTRE_VOTRE_CLÉ_API_ICI'; // IMPORTANT: Remplacez par votre clé
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

export async function callGeminiApi(prompt: string): Promise<string> {
  if (API_KEY === 'METTRE_VOTRE_CLÉ_API_ICI') {
    throw new Error('Veuillez remplacer le placeholder par votre clé API Gemini dans src/shared/ai/gemini-api.ts');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Erreur de l'API Gemini : ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();

  if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
    return data.candidates[0].content.parts[0].text;
  }

  if (data.promptFeedback && data.promptFeedback.blockReason) {
     throw new Error(`Le prompt a été bloqué par l'API Gemini. Raison: ${data.promptFeedback.blockReason}`);
  }

  return "L'API Gemini n'a pas retourné de contenu.";
}
