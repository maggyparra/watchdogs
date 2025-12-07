import { GoogleGenAI } from "@google/genai";
import { Incident, FetchIncidentsResponse, GroundingSource } from "../types";
import { v4 as uuidv4 } from 'uuid';

const apiKey = process.env.API_KEY;

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: apiKey });

export const fetchRealTimeIncidents = async (query: string = ""): Promise<FetchIncidentsResponse> => {
  if (!apiKey) {
    console.error("API Key is missing");
    throw new Error("API Key is missing");
  }

  const model = "gemini-2.5-flash"; 
  
  // Specific prompt for Stanford/Bay Area shootings and specific requested events
  const basePrompt = `
    You are a specialized real-time crime intelligence analyst for Stanford, California (Coordinates: 37.4275° N, 122.1697° W).
    
    TASK:
    1. FIRST, search for REAL, confirmed reports of shootings/shots fired specifically in **Stanford, Palo Alto, and on the Stanford Campus** in the last 7 days.
    2. SECOND, specifically check for "Westfield Valley Fair" or "Valley Fair Mall" shootings (San Jose/Santa Clara) as requested by the user.
    3. THIRD, IF AND ONLY IF there are no active/recent shootings in Stanford/Palo Alto, broaden your search to the "Immediate Bay Area" (East Palo Alto, Menlo Park, Mountain View, San Jose, Redwood City) to populate a Knowledge Graph of nearby threats.
    
    DATA SOURCES:
    - Police Departments (Stanford DPS, PAPD, SJPD)
    - Verified X (Twitter) accounts (e.g., @ScannerFrequencies, @BayAreaNews)
    - Local News (KRON4, NBC Bay Area)

    RETURN FORMAT:
    Return a strictly formatted JSON array inside a markdown code block.
    
    Structure per event:
    {
      "title": "Headline (e.g., 'Shots Fired at Valley Fair')",
      "severity": "critical" (confirmed shooting) | "high" (shots heard) | "medium" (police activity) | "low",
      "location": "Specific Address or City",
      "coordinates": { "lat": 37.xxx, "lng": -121.xxx }, // REQUIRED: Best estimate coordinates for the map
      "timestamp": "ISO Date String",
      "description": "Precise details. Mention if confirmed or false alarm.",
      "status": "Active" | "Resolved" | "False Alarm" | "Investigation",
      "synthesis": "Synthesis of user reports."
    }
    
    ${query ? `Additional Context: ${query}` : ''}
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: basePrompt,
      config: {
        // We use both googleSearch (for news/tweets) and googleMaps (for accurate location grounding)
        tools: [{ googleSearch: {} }, { googleMaps: {} }], 
      },
    });

    const text = response.text;
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    // Parse the JSON from the text response
    let parsedIncidents: any[] = [];
    try {
      // Remove markdown code blocks if present
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/) || [null, text];
      const cleanJson = jsonMatch[1] ? jsonMatch[1].trim() : text.trim();
      parsedIncidents = JSON.parse(cleanJson);
    } catch (e) {
      console.error("Failed to parse JSON from Gemini response:", e);
      parsedIncidents = [];
    }

    // Extract grounding chunks (URLs)
    const rawChunks = groundingMetadata?.groundingChunks || [];
    const allSources: GroundingSource[] = rawChunks
      .map((chunk: any) => {
        // Handle Search Web Source
        if (chunk.web?.uri) {
          return {
            title: chunk.web.title || "Web Source",
            url: chunk.web.uri,
          };
        }
        return null;
      })
      .filter((s: GroundingSource | null): s is GroundingSource => s !== null);

    // Map to our strict Incident type
    const incidents: Incident[] = parsedIncidents.map((item: any) => ({
      id: uuidv4(),
      title: item.title || "Unidentified Incident",
      severity: (['critical', 'high', 'medium', 'low'].includes(item.severity) ? item.severity : 'high') as any,
      location: item.location || "Bay Area, CA",
      coordinates: item.coordinates || { lat: 37.4275, lng: -122.1697 }, // Default to Stanford if missing
      timestamp: item.timestamp || new Date().toISOString(),
      description: item.description || "Details emerging...",
      discussion: {
        shooterStatus: item.status || "Unknown",
        userSummary: item.synthesis || item.description,
        sources: allSources.slice(0, 5), 
      }
    }));

    return {
      incidents,
      groundingChunks: rawChunks
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};