console.log('Starting 2mincheat Premium Server...');

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

console.log('Initializing database...');
let db: any;
try {
    const dbPath = process.env.DATABASE_PATH || 'documents.db';
    db = new Database(dbPath);
    console.log(`Database connected at ${dbPath}`);
} catch (err) {
    console.error('Database connection error:', err);
}

if (db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_name TEXT,
            original_file TEXT,
            converted_docx TEXT,
            converted_pdf TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// Storage Setup
const UPLOADS_DIR = path.join(process.cwd(), 'media/uploads');
const CONVERTED_DIR = path.join(process.cwd(), 'media/converted');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(CONVERTED_DIR)) fs.mkdirSync(CONVERTED_DIR, { recursive: true });

import multer from 'multer';
import { GoogleGenAI, Type } from "@google/genai";

const getAI = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return null;
    }
    return new GoogleGenAI({ apiKey });
};

const storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

app.use(express.json());
app.use('/media', express.static('media'));

// Download Route
app.get('/api/download', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });
    
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (fs.existsSync(absolutePath)) {
        res.download(absolutePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API Routes
app.get('/api/documents', (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    const docs = db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();
    res.json(docs);
});

app.delete('/api/documents/:id', (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    const { id } = req.params;
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (doc) {
        try {
            if (fs.existsSync(doc.original_file)) fs.unlinkSync(doc.original_file);
            if (fs.existsSync(doc.converted_docx)) fs.unlinkSync(doc.converted_docx);
            if (fs.existsSync(doc.converted_pdf)) fs.unlinkSync(doc.converted_pdf);
        } catch (e) {
            console.error('Error deleting files:', e);
        }
        db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    }
    res.json({ success: true });
});

app.delete('/api/documents-reset', (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const docs = db.prepare('SELECT * FROM documents').all() as any[];
    for (const doc of docs) {
        try {
            if (fs.existsSync(doc.original_file)) fs.unlinkSync(doc.original_file);
            if (fs.existsSync(doc.converted_docx)) fs.unlinkSync(doc.converted_docx);
            if (fs.existsSync(doc.converted_pdf)) fs.unlinkSync(doc.converted_pdf);
        } catch (e) {
            console.error('Error deleting files during reset:', e);
        }
    }
    
    db.prepare('DELETE FROM documents').run();
    res.json({ success: true });
});

app.use(express.json({ limit: '10mb' }));

// Helper to extract Q&A using Gemini (Fastest Model)
async function extractQA(text: string) {
    try {
        const ai = getAI();
        if (!ai) {
            console.warn("GEMINI_API_KEY is missing. Using basic splitting fallback. Set GEMINI_API_KEY in Settings > Secrets for better results.");
            return basicSplittingFallback(text);
        }
        
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Extract questions and their corresponding answers from the following text. 
            If the text is not in Q&A format, break it down into logical sections or points.
            Format the output as a JSON array of objects with "q" and "a" keys.
            Text: ${text}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            q: { type: Type.STRING },
                            a: { type: Type.STRING }
                        },
                        required: ["q", "a"]
                    }
                }
            }
        });
        const result = JSON.parse(response.text);
        if (result && result.length > 0) return result;
        throw new Error("Empty result from Gemini");
    } catch (err) {
        if (err instanceof Error && err.message.includes("GEMINI_API_KEY is missing")) {
            // Already handled or logged as warning
        } else {
            console.error('Gemini extraction failed, falling back to basic splitting:', err);
        }
        return basicSplittingFallback(text);
    }
}

function basicSplittingFallback(text: string) {
    // Improved fallback: Try to find Q&A, but if not, just return the whole text
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return [];

    const sections: { q: string, a: string }[] = [];
    let currentQ = '';
    let currentA = '';
    
    const isQuestionLine = (line: string) => line.match(/^(Q|Question|Q\.|[0-9]+[\.\)])/i);

    lines.forEach(line => {
        if (isQuestionLine(line)) {
            if (currentQ || currentA) sections.push({ q: currentQ, a: currentA || '' });
            currentQ = line;
            currentA = '';
        } else {
            if (!currentQ && sections.length === 0) {
                // If no question found yet, start with this as answer or part of first section
                currentA += (currentA ? '\n' : '') + line;
            } else {
                currentA += (currentA ? ' ' : '') + line;
            }
        }
    });
    
    if (currentQ || currentA) {
        sections.push({ q: currentQ, a: currentA || '' });
    }

    return sections.length > 0 ? sections : [{ q: '', a: text }];
}

async function generateConvertedFiles(docSections: { q: string, a: string }[], darkMode: boolean) {
    const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer } = await import('docx');
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    // 1. Generate DOCX
    const docxFileName = `converted-${Date.now()}.docx`;
    const docxPath = path.join(CONVERTED_DIR, docxFileName);

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    size: { width: 11906, height: 16838 },
                    margin: { top: 400, bottom: 400, left: 567, right: 567 },
                },
            },
            headers: {
                default: new Footer({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({
                                    text: "2mincheat - TECHSZDEVELOPER SECURE DOCUMENT",
                                    color: "DDDDDD",
                                    size: 10,
                                }),
                            ],
                        }),
                    ],
                }),
            },
            children: docSections.map(section => {
                const qText = section.q;
                const aText = section.a;
                
                return new Paragraph({
                    alignment: AlignmentType.JUSTIFIED,
                    spacing: { after: 40, line: 200, lineRule: "auto" },
                    keepNext: true,
                    children: [
                        new TextRun({
                            text: qText ? qText + " " : "",
                            bold: true,
                            underline: qText ? {} : undefined,
                            font: "Arial",
                            size: 22,
                        }),
                        new TextRun({
                            text: aText,
                            font: "Arial",
                            size: 22,
                        })
                    ]
                });
            })
        }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(docxPath, buffer);

    // 2. Generate PDF
    const pdfFileName = `converted-${Date.now()}.pdf`;
    const pdfPath = path.join(CONVERTED_DIR, pdfFileName);
    
    const pdfDoc = await PDFDocument.create();
    const arialFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const arialBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const bgColor = darkMode ? rgb(0, 0, 0) : rgb(1, 1, 1);
    const textColor = darkMode ? rgb(1, 1, 1) : rgb(0, 0, 0);
    const watermarkTextColor = darkMode ? rgb(1, 1, 1) : rgb(0.6, 0.6, 0.6);

    const margin = 28.35;
    const fontSize = 10;
    const lineHeight = fontSize + 1.2;

    const drawWatermark = (page: any) => {
        const { width, height } = page.getSize();
        const texts = ["2mincheat", "TECHSZDEVELOPER"];
        const size = 30;
        const opacity = darkMode ? 0.08 : 0.15; // Darker watermark
        
        // Smaller steps for more quantity
        const stepX = 220;
        const stepY = 180;

        for (let i = -1; i < 5; i++) {
            for (let j = -1; j < 7; j++) {
                // Randomly pick one of the texts
                const text = texts[Math.floor(Math.random() * texts.length)];
                
                page.drawText(text, {
                    x: i * stepX + (j % 2 === 0 ? 0 : 50), // Offset every other row for better coverage
                    y: j * stepY,
                    size,
                    font: arialBoldFont,
                    color: watermarkTextColor,
                    opacity,
                    rotate: { type: 'degrees', angle: 45 },
                });
            }
        }
    };

    let page = pdfDoc.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: bgColor });
    drawWatermark(page);
    const { width, height } = page.getSize();
    let y = height - margin - 10;

    const sanitizeText = (text: string) => {
        // Replace common non-WinAnsi characters with safe alternatives
        return text
            .replace(/[^\x00-\x7F\x80-\xFF]/g, (char) => {
                const map: { [key: string]: string } = {
                    '○': 'o',
                    '●': '*',
                    '□': '[]',
                    '■': '[*]',
                    '✓': 'v',
                    '✔': 'v',
                    '✕': 'x',
                    '✖': 'x',
                    '–': '-', // en dash
                    '—': '--', // em dash
                    '‘': "'",
                    '’': "'",
                    '“': '"',
                    '”': '"',
                    '…': '...',
                    '→': '->',
                    '←': '<-',
                    '•': '*',
                };
                return map[char] || '?';
            });
    };

    for (const section of docSections) {
        const cleanQ = sanitizeText(section.q);
        const cleanA = sanitizeText(section.a);
        
        const qWords = cleanQ.split(/\s+/).filter(w => w.length > 0).map(w => ({ text: w, isQuestion: true }));
        const aWords = cleanA.split(/\s+/).filter(w => w.length > 0).map(w => ({ text: w, isQuestion: false }));
        const allWords = [...qWords, ...aWords];
        
        // Pre-calculate height
        let tempY = y;
        let tempLineWidth = 0;
        let lineCount = 1;
        
        for (const wordObj of allWords) {
            const font = wordObj.isQuestion ? arialBoldFont : arialFont;
            const wordWidth = font.widthOfTextAtSize(wordObj.text + ' ', fontSize);
            
            if (tempLineWidth + wordWidth > width - (2 * margin)) {
                lineCount++;
                tempLineWidth = wordWidth;
            } else {
                tempLineWidth += wordWidth;
            }
        }
        
        const totalSectionHeight = (lineCount * lineHeight) + 4;
        if (y - totalSectionHeight < margin) {
            page = pdfDoc.addPage([595.28, 841.89]);
            page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: bgColor });
            drawWatermark(page);
            y = height - margin - 10;
        }

        // Draw words
        let currentLineWidth = 0;
        let currentLineWords: { text: string, isQuestion: boolean }[] = [];

        const renderLine = (words: { text: string, isQuestion: boolean }[], isLast: boolean) => {
            if (words.length === 0) return;
            
            const totalWordsWidth = words.reduce((acc, w) => {
                const font = w.isQuestion ? arialBoldFont : arialFont;
                return acc + font.widthOfTextAtSize(w.text, fontSize);
            }, 0);
            
            const availableWidth = width - (2 * margin);
            const spaceCount = words.length - 1;
            const spaceWidth = spaceCount > 0 ? (availableWidth - totalWordsWidth) / spaceCount : 0;
            const useJustify = !isLast && words.length > 1;

            let drawX = margin;
            words.forEach((w, idx) => {
                const font = w.isQuestion ? arialBoldFont : arialFont;
                page.drawText(w.text, { x: drawX, y, size: fontSize, font, color: textColor });
                
                if (w.isQuestion && w.text.trim().length > 0) {
                    const wWidth = font.widthOfTextAtSize(w.text, fontSize);
                    page.drawLine({
                        start: { x: drawX, y: y - 1 },
                        end: { x: drawX + wWidth, y: y - 1 },
                        thickness: 0.4,
                        color: textColor,
                    });
                }

                const actualSpace = useJustify ? spaceWidth : arialFont.widthOfTextAtSize(' ', fontSize);
                drawX += font.widthOfTextAtSize(w.text, fontSize) + actualSpace;
            });
        };

        for (let i = 0; i < allWords.length; i++) {
            const wordObj = allWords[i];
            const font = wordObj.isQuestion ? arialBoldFont : arialFont;
            const wordWidth = font.widthOfTextAtSize(wordObj.text + ' ', fontSize);

            if (currentLineWidth + wordWidth > width - (2 * margin)) {
                renderLine(currentLineWords, false);
                y -= lineHeight;
                currentLineWords = [wordObj];
                currentLineWidth = wordWidth;
            } else {
                currentLineWords.push(wordObj);
                currentLineWidth += wordWidth;
            }
        }
        
        if (currentLineWords.length > 0) {
            renderLine(currentLineWords, true);
        }
        
        y -= (lineHeight + 4);
    }
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);

    return { docxPath, pdfPath };
}

// Unified conversion handler
async function handleConversionProcess(text: string, originalName: string, originalPath: string, darkMode: boolean) {
    const docSections = await extractQA(text);
    const { docxPath, pdfPath } = await generateConvertedFiles(docSections, darkMode);

    if (db) {
        const stmt = db.prepare('INSERT INTO documents (original_name, original_file, converted_docx, converted_pdf) VALUES (?, ?, ?, ?)');
        stmt.run(originalName, originalPath, docxPath, pdfPath);
    }
    return { success: true };
}

app.post('/api/convert-text', async (req, res) => {
    const { text, darkMode } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    try {
        // Save pasted text as a temporary file for consistency
        const fileName = `pasted-${Date.now()}.txt`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(filePath, text);

        // Use first 100 chars of text as name to avoid truncation
        const displayName = text.trim().substring(0, 100).replace(/\n/g, ' ');

        await handleConversionProcess(text, displayName, filePath, darkMode);
        res.json({ success: true });
    } catch (error) {
        console.error('Text conversion error:', error);
        res.status(500).json({ error: 'Failed to convert text' });
    }
});

app.post('/api/convert', upload.single('document'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const originalPath = req.file.path;
    const originalName = req.file.originalname;
    const fileExt = path.extname(originalName).toLowerCase();
    const darkMode = req.body.darkMode === 'true' || req.body.darkMode === true;

    try {
        let rawText = '';
        if (fileExt === '.docx') {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ path: originalPath });
            rawText = result.value;
        } else if (fileExt === '.pdf') {
            const pdfParse = (await import('pdf-parse')) as any;
            const dataBuffer = fs.readFileSync(originalPath);
            const data = await pdfParse(dataBuffer);
            rawText = data.text;
        } else if (fileExt === '.txt') {
            rawText = fs.readFileSync(originalPath, 'utf8');
        } else {
            return res.status(400).json({ error: 'Unsupported file format' });
        }

        await handleConversionProcess(rawText, originalName, originalPath, darkMode);
        res.json({ success: true });
    } catch (error) {
        console.error('Conversion error:', error);
        res.status(500).json({ error: 'Failed to convert document' });
    }
});

async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        console.log('Creating Vite server...');
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        console.log('Vite server created.');
        app.use(vite.middlewares);
    } else {
        console.log('Running in production mode.');
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
