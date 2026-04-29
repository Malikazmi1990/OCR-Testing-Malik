/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { nanoid } from 'nanoid';

import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.NODE_ENV === 'production' ? 3000 : 3001;

// Firebase Admin Setup
// Note: In AI Studio, we use the environment variable for credentials if available
// or assume we have ambient credentials in the container
const firebaseConfig = process.env.FIREBASE_SERVICE_ACCOUNT 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
  : null;

const adminApp = firebaseConfig 
  ? initializeApp({ credential: cert(firebaseConfig) })
  : initializeApp();

const db = getFirestore(adminApp);
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY || '');

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/**
 * Middleware to validate API Key
 */
const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key is missing' });
  }

  try {
    const keysRef = db.collection('api_keys');
    const snapshot = await keysRef.where('key', '==', apiKey).where('active', '==', true).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ error: 'Invalid or inactive API key' });
    }

    const keyDoc = snapshot.docs[0].data();
    req.user = { uid: keyDoc.uid };
    next();
  } catch (error) {
    console.error('API Key validation error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

/**
 * Endpoint: Extract ID Data
 */
app.post('/api/v1/extract', validateApiKey, async (req, res) => {
  const { image, mimeType } = req.body;

  if (!image || !mimeType) {
    return res.status(400).json({ error: 'Image data and mimeType are required' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = "Extract all information from this identity document. Return a JSON object following the provided schema.";
    // Simple mock of the schema logic for brevity, in production use shared EXTRACTION_SCHEMA
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: image,
          mimeType: mimeType
        }
      }
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse JSON from AI response");
    
    const extractedData = JSON.parse(jsonMatch[0]);

    // Save to user's history
    const docRef = await db.collection('documents').add({
      ...extractedData,
      ownerId: req.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      source: 'api'
    });

    res.json({ id: docRef.id, data: extractedData });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

/**
 * Endpoint: Get Documents History
 */
app.get('/api/v1/documents', validateApiKey, async (req, res) => {
  try {
    const docsRef = db.collection('documents');
    const snapshot = await docsRef
      .where('ownerId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const documents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ documents });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Serve static files from the React app
const distPath = path.join(__dirname, '../../web/dist');

// Auth Middleware (mock for internal key gen)
// In a real app, use firebase-admin to verify tokens
app.post('/api/internal/generate-key', async (req, res) => {
  // In a real app, verify the Firebase ID Token here
  const { uid } = req.body; 

  if (!uid) return res.status(400).json({ error: 'UID required' });

  try {
    const newKey = `sk_live_${nanoid(32)}`;
    
    // Revoke old keys (optional policy)
    const existingKeys = await db.collection('api_keys').where('uid', '==', uid).get();
    const batch = db.batch();
    existingKeys.forEach(doc => batch.update(doc.ref, { active: false }));
    
    // Add new key
    const newKeyRef = db.collection('api_keys').doc();
    batch.set(newKeyRef, {
      key: newKey,
      uid: uid,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      lastUsed: null
    });

    await batch.commit();
    res.json({ apiKey: newKey });
  } catch (error) {
    console.error('Key generation error:', error);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

// Handle API routes first, then static files, then fallback
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`API Server listening at http://localhost:${port}`);
});
