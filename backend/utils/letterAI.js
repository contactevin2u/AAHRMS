const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Improve letter content - make it more professional
 * @param {string} content - Original letter content
 * @param {string} letterType - Type of letter (warning, appreciation, etc.)
 * @returns {Object} - Improved content
 */
async function improveLetterContent(content, letterType) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional HR letter writer. Your task is to improve the given letter content while:
- Maintaining the same meaning and key information
- Making it more professional and polished
- Using appropriate HR terminology
- Keeping a respectful and appropriate tone for a ${letterType || 'HR'} letter
- Preserving any placeholders like {{employee_name}} exactly as they are
- Do not add new information that wasn't in the original
- Keep similar length - don't make it significantly longer

Return ONLY the improved letter content, no explanations.`
        },
        {
          role: 'user',
          content: `Improve this ${letterType || 'HR'} letter:\n\n${content}`
        }
      ],
      max_tokens: 1500,
      temperature: 0.7
    });

    const improvedContent = response.choices[0]?.message?.content || content;

    return {
      success: true,
      content: improvedContent.trim()
    };
  } catch (error) {
    console.error('Letter improvement error:', error);
    return {
      success: false,
      error: error.message,
      content: content
    };
  }
}

/**
 * Adjust the tone of a letter
 * @param {string} content - Original letter content
 * @param {string} tone - Target tone (formal, friendly, stern, neutral)
 * @param {string} letterType - Type of letter
 * @returns {Object} - Adjusted content
 */
async function adjustLetterTone(content, tone, letterType) {
  const toneDescriptions = {
    formal: 'very formal and professional, using corporate language and maintaining strict professional distance',
    friendly: 'warm and approachable while still being professional, showing care for the employee',
    stern: 'serious and firm, emphasizing the gravity of the situation without being disrespectful',
    neutral: 'balanced and objective, neither too warm nor too cold, straightforward and clear'
  };

  const toneDesc = toneDescriptions[tone] || toneDescriptions.neutral;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional HR letter writer. Rewrite the given letter to have a ${tone} tone.

The tone should be: ${toneDesc}

Rules:
- Keep the same meaning and all key information
- Preserve any placeholders like {{employee_name}} exactly as they are
- Do not add new information
- Keep similar length
- Ensure the tone is appropriate for a ${letterType || 'HR'} letter

Return ONLY the rewritten letter content, no explanations.`
        },
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 1500,
      temperature: 0.7
    });

    const adjustedContent = response.choices[0]?.message?.content || content;

    return {
      success: true,
      content: adjustedContent.trim(),
      tone: tone
    };
  } catch (error) {
    console.error('Tone adjustment error:', error);
    return {
      success: false,
      error: error.message,
      content: content
    };
  }
}

/**
 * Translate letter content between English and Malay
 * @param {string} content - Letter content to translate
 * @param {string} targetLanguage - Target language ('en' or 'ms')
 * @returns {Object} - Translated content
 */
async function translateLetter(content, targetLanguage) {
  const langNames = {
    en: 'English',
    ms: 'Bahasa Malaysia (Malay)'
  };

  const targetLang = langNames[targetLanguage] || 'English';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator specializing in HR documents. Translate the given letter to ${targetLang}.

Rules:
- Maintain the professional tone and meaning
- Preserve any placeholders like {{employee_name}} exactly as they are (do not translate placeholders)
- Use appropriate formal ${targetLang} for business/HR context
- Keep the same structure and formatting
- If translating to Malay, use formal Bahasa Malaysia suitable for official letters

Return ONLY the translated letter content, no explanations.`
        },
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    const translatedContent = response.choices[0]?.message?.content || content;

    return {
      success: true,
      content: translatedContent.trim(),
      targetLanguage: targetLanguage
    };
  } catch (error) {
    console.error('Translation error:', error);
    return {
      success: false,
      error: error.message,
      content: content
    };
  }
}

module.exports = {
  improveLetterContent,
  adjustLetterTone,
  translateLetter
};
