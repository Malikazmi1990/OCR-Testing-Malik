/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { IDDocumentData } from "@id-lens/shared";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function extractIDData(base64Image: string, mimeType: string): Promise<IDDocumentData> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Extract all data from this identity document (Passport, ID Card, Driver's License, E Visa, Residence Document, or Cancellation Document). 
  Return ONLY a clean JSON object representing the data. 
  Do NOT include any explanations, definitions, or repeated text in the field values.
  Format all dates (Expiry, Issue Date, Cancel Date, Date of Birth) as YYYY-MM-DD. 
  If a field is not found, return an empty string.

  Special instructions for Passports:
  - Identify "placeOfIssue" as the city, state, or office where the passport was issued.

  Special instructions for E-Visas:
  - Identify "visaApplicationNumber" as the digits directly below the barcode.
  - Identify "visaStatus" as the purpose or status text directly below the visa application number.
  - Identify "uidNo" and "entryPermitNo" if clearly labeled.

  Special instructions for Residence Documents (specifically UAE Residence):
  - Identify "uidNo" as U.I.D. No.
  - Identify "fileNo" as File No.
  - Identify "placeOfIssue" as Place of Issue (e.g. SHARJAH).
  - Identify "passportNo" as Passpurt No.
  - Identify "sponsor" as Sponsor name.
  - Identify "issueDate" as Issue Date.
  - Identify "dateOfExpiry" as Expiry Date.

  Special instructions for Cancellation Documents (Specifically Cancel Residence Inside UAE):
  - Identify "documentType" as "Cancel Residence".
  - Identify "uidNo" as U.I.D No.
  - Identify "fileNo" as File No.
  - Identify "passportNo" as Passport No.
  - Identify "fullName" as Name.
  - Identify "profession" as Profession.
  - Identify "sponsor" as Sponsor Name.
  - Identify "cancelDate" as Cancel Date.
  - Identify "cancelReason" as Cancel Reason.
  - Identify "documentStatus" as Status (e.g., CANCELLED).`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType
          }
        },
        {
          text: prompt
        }
      ]
    },
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          documentType: { type: Type.STRING },
          documentNumber: { type: Type.STRING },
          fullName: { type: Type.STRING },
          dateOfBirth: { type: Type.STRING },
          placeOfBirth: { type: Type.STRING },
          dateOfExpiry: { type: Type.STRING },
          issuingCountry: { type: Type.STRING },
          issuingAuthority: { type: Type.STRING },
          placeOfIssue: { type: Type.STRING },
          nationality: { type: Type.STRING },
          gender: { type: Type.STRING },
          profession: { type: Type.STRING },
          visaApplicationNumber: { type: Type.STRING },
          uidNo: { type: Type.STRING },
          entryPermitNo: { type: Type.STRING },
          visaStatus: { type: Type.STRING },
          fileNo: { type: Type.STRING },
          passportNo: { type: Type.STRING },
          sponsor: { type: Type.STRING },
          issueDate: { type: Type.STRING },
          cancelDate: { type: Type.STRING },
          cancelReason: { type: Type.STRING },
          documentStatus: { type: Type.STRING },
          additionalFields: {
            type: Type.OBJECT,
            additionalProperties: { type: Type.STRING }
          }
        },
        required: ["documentType", "documentNumber", "fullName"]
      }
    }
  });

  const text = response.text;

  if (!text) {
    throw new Error("No data extracted from document");
  }

  try {
    // The SDK with responseMimeType: "application/json" should return pure JSON,
    // but we add a safety trim and markdown removal just in case.
    const cleanedText = text.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
    return JSON.parse(cleanedText) as IDDocumentData;
  } catch (e) {
    console.error("Failed to parse Gemini response:", text);
    throw new Error("The AI response was malformed. Please ensure the image is clear and try again.");
  }
}

export async function translateToArabic(data: IDDocumentData): Promise<IDDocumentData> {
  const model = "gemini-3-flash-preview";
  const prompt = `You are a professional translator. Translate the following identity document data from English to Arabic.
  Be precise with names, locations, and technical terms. 
  Maintain the exact same JSON structure.
  Return ONLY the clean JSON object.

  Data to translate:
  ${JSON.stringify(data, null, 2)}`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    }
  });

  const text = response.text;
  if (!text) throw new Error("Translation failed");

  try {
    const cleanedText = text.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
    return JSON.parse(cleanedText) as IDDocumentData;
  } catch (e) {
    console.error("Failed to parse Translation response:", text);
    throw new Error("Translation service returned malformed data.");
  }
}
