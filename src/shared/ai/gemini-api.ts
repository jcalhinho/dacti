// La clé API est maintenant récupérée depuis les variables d'environnement de Vite.
// Créez un fichier .env.local à la racine de votre projet et ajoutez-y :
// VITE_GEMINI_API_KEY='VOTRE_CLÉ_API_ICI'
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

export async function callGeminiApi(prompt: string): Promise<string> {
  if (!API_KEY || API_KEY === 'VOTRE_CLÉ_API_ICI') {
    throw new Error('La clé API Gemini n\'est pas configurée. Veuillez l\'ajouter à votre fichier .env.local.');
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
