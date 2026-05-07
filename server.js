import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
// Give a nice big limit for large scans/PDFs
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

app.post('/api/analyze', async (req, res) => {
  try {
    const { fileName, fileContent } = req.body;
    
    // Check if API key is provided
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'GEMINI_API_KEY is not set in the server environment (.env file).' 
      });
    }
    const systemPrompt = `You are MedScan AI, an expert medical analysis system trained on clinical data. First, verify if the provided file is a valid medical document, scan, or report. 

If it is NOT a valid medical file (e.g., it is a resume, newspaper, generic photo, random image, menu, receipt, etc.), you MUST return exactly this JSON and nothing else:
{
  "is_medical": false,
  "error_message": "Invalid file — please upload a medical report, X-ray, or scan."
}

If it IS a valid medical file, analyse it and return a JSON object ONLY — no markdown, no backticks, no preamble.
JSON structure:
{
  "is_medical": true,
  "confidence": "XX%",
  "summary": "2-3 sentence plain-English summary of the medical file and key observations.",
  "findings": ["finding 1", "finding 2", "finding 3"],
  "diseases": [
    {"name": "Condition Name", "probability": 85, "severity": "low|medium|high", "icon": "🫁"}
  ],
  "drugs": [
    {"name": "Drug Name", "dose": "Dosage", "purpose": "What it treats", "note": "Side effect"}
  ],
  "lifestyle": ["Recommendation 1", "Recommendation 2"],
  "followup": "2-3 sentences on next steps."
}

Be specific, clinically accurate, and human-sounding.`;

    const userContent = [];
    
    if (fileContent.type === 'text') {
        userContent.push({ 
            type: 'text', 
            text: `Please analyse this medical file (${fileName}):\n\n${fileContent.data.substring(0, 8000)}\n\nReturn JSON analysis only.` 
        });
    } else if (fileContent.mediaType && fileContent.mediaType.startsWith('image/')) {
        userContent.push({
            type: 'image',
            source: { 
                type: 'base64', 
                media_type: fileContent.mediaType, 
                data: fileContent.data 
            }
        });
        userContent.push({ 
            type: 'text', 
            text: `Please analyse this medical image (file: ${fileName}) and return the JSON analysis.` 
        });
    } else if (fileContent.mediaType === 'application/pdf') {
        userContent.push({
            type: 'document',
            source: { 
                type: 'base64', 
                media_type: 'application/pdf', 
                data: fileContent.data 
            }
        });
        userContent.push({ 
            type: 'text', 
            text: `Please analyse this medical document PDF (file: ${fileName}) and return the JSON analysis.` 
        });
    } else {
        return res.status(400).json({ error: 'Unsupported file type.' });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    contents: [
      {
        parts: [
          { text: systemPrompt },
          { text: userContent }
        ]
      }
    ]
  })
});

    if (!response.ok) {
        const errData = await response.text();
        console.error("Anthropic API Error:", response.status, errData);
        throw new Error(`Anthropic API error: ${response.status} - ${errData}`);
    }

    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');
    
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    
    res.json(parsed);

  } catch (err) {
    console.error('SERVER ERROR:', err);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MedScan AI server running on http://localhost:${PORT}`);
  console.log(`Place your ANTHROPIC_API_KEY in the .env file to enable AI Analysis.`);
});
