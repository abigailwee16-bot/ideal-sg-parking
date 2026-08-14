/**
 * @file api/insight.js
 * @description Secure server-side explanation endpoint for Singapore Parking Discovery.
 * Uses Gemini API (@google/genai) to generate factual, grounded explanations of why a
 * carpark was recommended based on objective multi-criteria data.
 */

import { GoogleGenAI } from '@google/genai';

/**
 * Initializes the Gemini API client lazily using server-side environment variables.
 * @returns {GoogleGenAI | null}
 */
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Validates and sanitizes incoming request payload.
 * @param {any} body 
 * @returns {{ valid: boolean, error?: string, data?: any }}
 */
export function validateInsightPayload(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const { destination, durationMinutes, recommendedCarpark, candidateCarparks } = body;

  if (!destination || typeof destination.name !== 'string') {
    return { valid: false, error: 'Valid destination with a name is required.' };
  }

  if (typeof durationMinutes !== 'number' || durationMinutes <= 0 || durationMinutes > 1440) {
    return { valid: false, error: 'Duration must be a positive number of minutes (up to 24 hours).' };
  }

  if (!recommendedCarpark || typeof recommendedCarpark.name !== 'string') {
    return { valid: false, error: 'Recommended carpark information is required.' };
  }

  if (!Array.isArray(candidateCarparks) || candidateCarparks.length === 0) {
    return { valid: false, error: 'Candidate carparks list must be a non-empty array.' };
  }

  // Sanitize candidate list to prevent huge prompts
  const sanitizedCandidates = candidateCarparks.slice(0, 8).map(c => ({
    name: String(c.name || 'Unknown Carpark').slice(0, 80),
    operator: String(c.operator || 'Unknown').slice(0, 40),
    availableLots: typeof c.availableLots === 'number' ? c.availableLots : 'Unavailable',
    totalLots: typeof c.totalLots === 'number' ? c.totalLots : 'Unavailable',
    availabilityStatus: String(c.availabilityStatus || 'Unknown').slice(0, 30),
    estimatedCost: typeof c.estimatedCost === 'number' ? `$${c.estimatedCost.toFixed(2)}` : 'Unavailable',
    distanceToDestination: typeof c.distanceToDestination === 'number' ? `${Math.round(c.distanceToDestination)}m` : 'Unknown',
    travelTime: typeof c.travelTime === 'number' ? `${Math.round(c.travelTime)} min` : 'Unknown',
    rateSummary: String(c.pricing?.rateSummary || 'Standard Rates').slice(0, 100),
    source: String(c.source || 'Singapore Directory').slice(0, 50),
    deals: Array.isArray(c.verifiedDeals) ? c.verifiedDeals.slice(0, 2) : []
  }));

  return {
    valid: true,
    data: {
      destination: {
        name: String(destination.name).slice(0, 100),
        address: String(destination.address || '').slice(0, 150),
        lat: Number(destination.lat) || 1.3521,
        lng: Number(destination.lng) || 103.8198
      },
      durationMinutes,
      recommendedCarpark: {
        name: String(recommendedCarpark.name).slice(0, 80),
        operator: String(recommendedCarpark.operator || 'Unknown').slice(0, 40),
        availableLots: typeof recommendedCarpark.availableLots === 'number' ? recommendedCarpark.availableLots : 'Unavailable',
        availabilityStatus: String(recommendedCarpark.availabilityStatus || 'Unknown').slice(0, 30),
        estimatedCost: typeof recommendedCarpark.estimatedCost === 'number' ? `$${recommendedCarpark.estimatedCost.toFixed(2)}` : 'Unavailable',
        distanceToDestination: typeof recommendedCarpark.distanceToDestination === 'number' ? `${Math.round(recommendedCarpark.distanceToDestination)}m` : 'Unknown',
        travelTime: typeof recommendedCarpark.travelTime === 'number' ? `${Math.round(recommendedCarpark.travelTime)} min` : 'Unknown',
        rateSummary: String(recommendedCarpark.pricing?.rateSummary || 'Standard Rates').slice(0, 100),
        deterministicScore: typeof recommendedCarpark.deterministicScore === 'number' ? recommendedCarpark.deterministicScore : null,
        deals: Array.isArray(recommendedCarpark.verifiedDeals) ? recommendedCarpark.verifiedDeals : []
      },
      candidateCarparks: sanitizedCandidates
    }
  };
}

/**
 * Generates a rule-based deterministic explanation fallback if Gemini is offline.
 * @param {any} data
 * @returns {object}
 */
export function generateDeterministicInsight(data) {
  const { destination, durationMinutes, recommendedCarpark, candidateCarparks } = data;
  const hours = (durationMinutes / 60).toFixed(1).replace('.0', '');
  
  // Find second best or cheaper alternative to discuss trade-offs
  const otherOptions = candidateCarparks.filter(c => c.name !== recommendedCarpark.name);
  const cheaperOption = otherOptions.find(c => {
    const cost = parseFloat(String(c.estimatedCost).replace('$', ''));
    const recCost = parseFloat(String(recommendedCarpark.estimatedCost).replace('$', ''));
    return !isNaN(cost) && !isNaN(recCost) && cost < recCost;
  });

  const higherLotsOption = otherOptions.find(c => {
    return typeof c.availableLots === 'number' && 
      typeof recommendedCarpark.availableLots === 'number' && 
      c.availableLots > recommendedCarpark.availableLots;
  });

  let tradeOff = 'Provides the optimal balance between lot availability, proximity, and estimated parking fees.';
  if (cheaperOption) {
    tradeOff = `${cheaperOption.name} has a lower estimated fee (${cheaperOption.estimatedCost}), but is further away (${cheaperOption.distanceToDestination}).`;
  } else if (higherLotsOption) {
    tradeOff = `${higherLotsOption.name} currently has more open lots (${higherLotsOption.availableLots}), but has higher rates or longer walking distance.`;
  }

  return {
    source: 'Deterministic Recommender',
    summary: `${recommendedCarpark.name} is recommended for your trip to ${destination.name} because it offers ${recommendedCarpark.availableLots} lots (${recommendedCarpark.availabilityStatus}) at ${recommendedCarpark.distanceToDestination} walking distance with an estimated cost of ${recommendedCarpark.estimatedCost} for ${hours} hr.`,
    tradeOff: tradeOff,
    costBreakdown: `Estimated at ${recommendedCarpark.estimatedCost} for ${durationMinutes} minutes based on rate structure: ${recommendedCarpark.rateSummary}.`,
    availabilityCaveat: recommendedCarpark.availableLots === 'Unavailable' 
      ? 'Live lot count is currently unavailable for this operator; check physical signboard on arrival.'
      : `Availability is based on recent parking data. Lots may fluctuate during peak shopping/dining hours.`,
    verifiedDeals: recommendedCarpark.deals && recommendedCarpark.deals.length > 0 
      ? recommendedCarpark.deals 
      : []
  };
}

/**
 * Handles the /api/insight HTTP POST request.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
export async function handleInsightRequest(req, res) {
  const validation = validateInsightPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const data = validation.data;
  const ai = getGeminiClient();

  if (!ai) {
    // Return deterministic fallback if Gemini key is not configured
    const fallback = generateDeterministicInsight(data);
    return res.json({
      ...fallback,
      isAiGenerated: false,
      note: 'Generated by deterministic scoring engine (Gemini API key not configured).'
    });
  }

  try {
    const prompt = `
You are the AI explanation engine for Singapore Parking Discovery.
Explain to a Singapore driver why "${data.recommendedCarpark.name}" was selected as the top deterministic recommendation for their destination "${data.destination.name}" for a duration of ${data.durationMinutes} minutes (${(data.durationMinutes/60).toFixed(1)} hours).

CRITICAL RULES:
1. Ground your explanation ONLY in the provided structured data below. Do NOT invent prices, lot counts, distance, or deals.
2. If any information is absent, state "Information not available".
3. Provide a clear, concise Singapore-focused explanation in structured JSON format.

Structured Application Data:
- Destination: ${data.destination.name} (${data.destination.address || 'Singapore'})
- Parking Duration: ${data.durationMinutes} mins
- Recommended Carpark: ${JSON.stringify(data.recommendedCarpark)}
- Nearby Candidate Carparks: ${JSON.stringify(data.candidateCarparks)}

Return ONLY valid JSON matching this exact structure:
{
  "summary": "2 sentences explaining why this carpark scored highest using the objective numbers.",
  "tradeOff": "1 sentence describing the key trade-off vs nearby alternatives (e.g. price vs distance vs lots).",
  "costBreakdown": "Explicit breakdown of the estimated ${data.recommendedCarpark.estimatedCost} cost based on the rates.",
  "availabilityCaveat": "Factual caveat regarding peak hours or data freshness for this location.",
  "dealHighlight": "Brief mention of verified dining/rebate deals if present in the data, or null if none."
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Empty response from Gemini API');
    }

    const parsed = JSON.parse(responseText);
    return res.json({
      source: 'Gemini 3.7 Flash',
      summary: parsed.summary || `${data.recommendedCarpark.name} offers the best balance of lots and proximity.`,
      tradeOff: parsed.tradeOff || 'Optimal balance between lot availability, proximity, and estimated cost.',
      costBreakdown: parsed.costBreakdown || `Estimated at ${data.recommendedCarpark.estimatedCost} for ${data.durationMinutes} mins.`,
      availabilityCaveat: parsed.availabilityCaveat || 'Availability is subject to rapid changes during peak periods.',
      dealHighlight: parsed.dealHighlight || (data.recommendedCarpark.deals?.[0]?.title || null),
      isAiGenerated: true,
      verifiedDeals: data.recommendedCarpark.deals || []
    });

  } catch (err) {
    console.error('Gemini insight generation failed, falling back to deterministic insight:', err);
    const fallback = generateDeterministicInsight(data);
    return res.json({
      ...fallback,
      isAiGenerated: false,
      fallbackReason: 'AI service temporarily unavailable, loaded deterministic rationale.'
    });
  }
}
