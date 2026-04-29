/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IDDocumentData {
  documentType: string;
  documentNumber: string;
  fullName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  dateOfExpiry: string;
  issuingCountry: string;
  issuingAuthority: string;
  placeOfIssue: string;
  nationality: string;
  gender: string;
  profession: string;
  visaApplicationNumber: string;
  uidNo: string;
  entryPermitNo: string;
  visaStatus: string;
  fileNo: string;
  passportNo: string;
  sponsor: string;
  issueDate: string;
  cancelDate: string;
  cancelReason: string;
  documentStatus: string;
  additionalFields?: Record<string, string>;
}

export interface ProcessingFile {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: IDDocumentData;
  resultAr?: IDDocumentData;
  error?: string;
}

export const EXTRACTION_SCHEMA = {
  description: "Extracted data from an identity document or visa",
  type: "object",
  properties: {
    documentType: { type: "string", description: "Type of document (e.g. Passport, National ID, Driver License, E Visa)" },
    documentNumber: { type: "string", description: "Unique number of the document" },
    fullName: { type: "string", description: "Full name as written on the document" },
    dateOfBirth: { type: "string", description: "Date of birth (YYYY-MM-DD)" },
    placeOfBirth: { type: "string", description: "Place of birth if visible" },
    dateOfExpiry: { type: "string", description: "Expiry date of the document (YYYY-MM-DD)" },
    issuingCountry: { type: "string", description: "Country that issued the document" },
    issuingAuthority: { type: "string", description: "The specific authority or office that issued the document" },
    placeOfIssue: { type: "string", description: "The specific place or city where the document was issued (common on Passports)" },
    nationality: { type: "string", description: "Nationality of the holder" },
    gender: { type: "string", description: "Gender/Sex (e.g., M, F)" },
    profession: { type: "string", description: "Profession of the holder if visible (common on visas)" },
    visaApplicationNumber: { type: "string", description: "Visa application number (found below barcode on E-Visas)" },
    uidNo: { type: "string", description: "U.I.D No if visible" },
    entryPermitNo: { type: "string", description: "Entry Permit No if visible" },
    visaStatus: { type: "string", description: "Visa status or purpose (e.g., EMPLOYMENT, TOURISM)" },
    fileNo: { type: "string", description: "File No (specifically for Residence documents)" },
    passportNo: { type: "string", description: "Passport Number as listed on the document" },
    sponsor: { type: "string", description: "Sponsor name (specifically for Residence documents)" },
    issueDate: { type: "string", description: "Date of issue (YYYY-MM-DD)" },
    cancelDate: { type: "string", description: "Cancellation date (YYYY-MM-DD)" },
    cancelReason: { type: "string", description: "Reason for cancellation" },
    documentStatus: { type: "string", description: "Status of the document (e.g., CANCELLED)" },
    additionalFields: { 
      type: "object", 
      additionalProperties: { type: "string" },
      description: "Any other important fields found on the document"
    }
  },
  required: ["documentType", "documentNumber", "fullName"]
};
