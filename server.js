import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3005;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ============================================
// MODEL CONFIG (Badilisha hapa tu kama unataka model nyingine)
// ============================================
const CHAT_MODEL = "openai/gpt-oss-120b";
const VISION_MODEL = "qwen/qwen3.6-27b";

// ============================================
// PAKIA KNOWLEDGE BASE
// ============================================
let knowledgeBase = [];
try {
  const kbPath = path.join(__dirname, 'knowledge-base.json');
  if (fs.existsSync(kbPath)) {
    knowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
    console.log(`✅ Knowledge Base loaded: ${knowledgeBase.length} categories`);
  } else {
    console.warn("⚠️ knowledge-base.json haipatikani.");
  }
} catch (err) {
  console.error("❌ Error loading knowledge base:", err.message);
}

function searchKnowledgeBase(userMessage) {
  if (!knowledgeBase || knowledgeBase.length === 0) return null;
  const text = userMessage.toLowerCase();
  let bestMatch = null;
  let highestScore = 0;

  knowledgeBase.forEach(entry => {
    let score = 0;
    entry.keywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) score += keyword.length;
    });
    if (score > highestScore) {
      highestScore = score;
      bestMatch = entry;
    }
  });

  return highestScore >= 4 ? bestMatch : null;
}

// ============================================
// MULTER
// ============================================
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 }
});

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `
You are ZYVO AI, an advanced, intelligent, helpful AI assistant.

PERSONALITY:
- Friendly, clear, and thorough.
- You explain concepts in detail when asked.
- You break down complex topics into simple steps.
- You use examples to illustrate.
- You respond in the SAME language the user uses (Kiswahili or English).

RESPONSE STYLE:
- Use clear headers and sections when helpful.
- Use numbered lists and bullet points for clarity.
- Explain WHY, not just WHAT.
- Give complete, working code when asked.
- Wrap code in triple backticks with language tag.
- Use emojis sparingly for readability.

FOR CODING:
- Provide COMPLETE, ready-to-use code.
- Explain what the code does and why.
- Show the file name and location.
- Include commands to run and test steps.

FOR GENERAL QUESTIONS:
- Give a clear, complete answer.
- Add context or examples when helpful.

ETHICS (CRITICAL):
- REFUSE illegal, harmful, immoral, or unethical requests politely.
- Explain why it is wrong.
- Suggest a legal, ethical alternative.

You are ZYVO AI — helpful, harmless, honest, and thorough.
`.trim();

// ============================================
// ROUTE YA CHAT
// ============================================
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Please provide a message." });
  }

  const kbMatch = searchKnowledgeBase(message);
  
  if (kbMatch) {
    console.log(`📚 Knowledge Base match: ${kbMatch.category}`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    const responseText = kbMatch.response;
    const chunkSize = 10;
    
    for (let i = 0; i < responseText.length; i += chunkSize) {
      res.write(responseText.substring(i, i + chunkSize));
      await new Promise(r => setTimeout(r, 5));
    }
    res.end();
    return;
  }

  console.log(`🤖 Groq API call [${CHAT_MODEL}]: "${message.substring(0, 50)}..."`);
  
  const messagesPayload = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-20),
    { role: "user", content: message }
  ];

  try {
    const stream = await groq.chat.completions.create({
      messages: messagesPayload,
      model: CHAT_MODEL,
      temperature: 0.7,
      max_completion_tokens: 3000,
      stream: true
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) res.write(content);
    }
    res.end();

  } catch (error) {
    console.error("--- GROQ API ERROR ---");
    console.error(error.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: "Failed to communicate with Groq API", 
        details: error.message,
        hint: `Model '${CHAT_MODEL}' haipatikani. Badilisha CHAT_MODEL juu ya server.js.`
      });
    }
    res.write("\n[An error occurred]");
    res.end();
  }
});

// ============================================
// ROUTE YA UPLOAD
// ============================================
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Hakuna faili lililotumwa." });
    }

    const { message } = req.body;
    const file = req.file;
    const userPrompt = message || "Chambua faili hili na kutoa muhtasari kamili.";

    let aiResponse = "";

    if (file.mimetype.startsWith('image/')) {
      const base64Image = file.buffer.toString('base64');
      const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

      const completion = await groq.chat.completions.create({
        messages: [{
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }],
        model: VISION_MODEL,
        temperature: 0.7,
        max_completion_tokens: 2000,
      });
      aiResponse = completion.choices[0]?.message?.content || "Sikuweza kuchambua picha.";
    }
    else if (file.mimetype === 'application/pdf') {
      const pdfData = await pdfParse(file.buffer);
      const extractedText = pdfData.text.substring(0, 15000);
      if (!extractedText.trim()) return res.status(400).json({ error: "PDF haina maandishi." });

      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${userPrompt}\n\n--- PDF ---\n${extractedText}` }
        ],
        model: CHAT_MODEL,
        temperature: 0.7,
        max_completion_tokens: 3000,
      });
      aiResponse = completion.choices[0]?.message?.content || "Sikuweza kuchambua PDF.";
    }
    else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const extractedText = result.value.substring(0, 15000);
      if (!extractedText.trim()) return res.status(400).json({ error: "DOCX haina maandishi." });

      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${userPrompt}\n\n--- DOCX ---\n${extractedText}` }
        ],
        model: CHAT_MODEL,
        temperature: 0.7,
        max_completion_tokens: 3000,
      });
      aiResponse = completion.choices[0]?.message?.content || "Sikuweza kuchambua DOCX.";
    }
    else if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
      const extractedText = file.buffer.toString('utf-8').substring(0, 15000);

      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${userPrompt}\n\n--- TEXT ---\n${extractedText}` }
        ],
        model: CHAT_MODEL,
        temperature: 0.7,
        max_completion_tokens: 3000,
      });
      aiResponse = completion.choices[0]?.message?.content || "Sikuweza kuchambua faili.";
    }
    else {
      return res.status(400).json({ 
        error: "Aina ya faili haitumiki. Tumia Picha, PDF, DOCX, TXT, au CSV." 
      });
    }

    res.json({ reply: aiResponse });

  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Imeshindwa kuchambua faili.", details: error.message });
  }
});

// ============================================
// ROUTE YA KU-CREATE DOCUMENT
// ============================================
app.post('/api/create-document', async (req, res) => {
  const { format, title, content } = req.body;

  if (!format || !content) {
    return res.status(400).json({ error: "Format na content zinahitajika." });
  }

  const docTitle = title || 'ZYVO AI Document';
  const safeTitle = docTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 50);

  try {
    // ============ WORD (.docx) ============
    if (format === 'docx') {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
      
      const lines = content.split('\n');
      const paragraphs = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return new Paragraph({ text: '' });
        
        if (/^#+\s/.test(trimmed)) {
          const text = trimmed.replace(/^#+\s/, '');
          return new Paragraph({ text, heading: HeadingLevel.HEADING_1 });
        }
        return new Paragraph({
          children: [new TextRun({ text: trimmed, size: 24 })]
        });
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({ text: docTitle, heading: HeadingLevel.TITLE }),
            ...paragraphs
          ]
        }]
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.docx"`);
      return res.send(buffer);
    }

    // ============ PDF ============
    if (format === 'pdf') {
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ margin: 50 });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);

      doc.pipe(res);
      doc.fontSize(24).fillColor('#1a73e8').text(docTitle, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).fillColor('#1f1f1f');

      const lines = content.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
          doc.moveDown();
          return;
        }
        if (/^#+\s/.test(trimmed)) {
          const text = trimmed.replace(/^#+\s/, '');
          doc.fontSize(18).fillColor('#1a73e8').text(text);
          doc.fontSize(12).fillColor('#1f1f1f');
        } else {
          doc.text(trimmed);
        }
      });

      doc.end();
      return;
    }

    // ============ EXCEL (.xlsx) ============
    if (format === 'xlsx') {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ZYVO AI';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Sheet1');

      sheet.mergeCells('A1:D1');
      sheet.getCell('A1').value = docTitle;
      sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1A73E8' } };
      sheet.getCell('A1').alignment = { horizontal: 'center' };

      const lines = content.split('\n').filter(l => l.trim());
      let row = 3;
      lines.forEach(line => {
        sheet.getCell(`A${row}`).value = line.trim();
        sheet.getCell(`A${row}`).alignment = { wrapText: true };
        row++;
      });

      sheet.getColumn(1).width = 100;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.xlsx"`);

      const buffer = await workbook.xlsx.writeBuffer();
      return res.send(buffer);
    }

    // ============ POWERPOINT (.pptx) ============
    if (format === 'pptx') {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';

      const titleSlide = pptx.addSlide();
      titleSlide.background = { color: 'F8FAFD' };
      titleSlide.addText(docTitle, {
        x: 0.5, y: 2, w: 9, h: 1.5,
        fontSize: 32, bold: true, color: '1A73E8', align: 'center'
      });
      titleSlide.addText('Generated by ZYVO AI', {
        x: 0.5, y: 4, w: 9, h: 0.5,
        fontSize: 14, color: '747775', align: 'center'
      });

      const sections = content.split(/\n\n+/).filter(s => s.trim());
      sections.forEach(section => {
        const slide = pptx.addSlide();
        slide.addText(section.trim(), {
          x: 0.5, y: 0.5, w: 9, h: 5,
          fontSize: 18, color: '1F1F1F', valign: 'top'
        });
      });

      const buffer = await pptx.write({ outputType: 'nodebuffer' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pptx"`);
      return res.send(buffer);
    }

    // ============ TXT ============
    if (format === 'txt') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.txt"`);
      return res.send(`${docTitle}\n\n${content}`);
    }

    return res.status(400).json({ error: "Format haitumiki. Tumia: docx, pdf, xlsx, pptx, au txt." });

  } catch (error) {
    console.error("Document Error:", error);
    res.status(500).json({ error: "Imeshindwa kutengeneza document.", details: error.message });
  }
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: "Faili ni kubwa mno. Kikomo ni 20MB.", details: err.message });
    }
    return res.status(400).json({ error: "Hitilafu ya faili.", details: err.message });
  }
  next(err);
});

// ============================================
// SERVER STARTUP
// ============================================
app.listen(PORT, () => {
  const OSC = '\x1b]8;;';
  const ST = '\x1b\\';
  
  const link1 = `${OSC}http://localhost:${PORT}${ST}http://localhost:${PORT}${OSC}${ST}`;
  const link2 = `${OSC}http://127.0.0.1:${PORT}${ST}http://127.0.0.1:${PORT}${OSC}${ST}`;
  
  console.log('\n🚀 ZYVO AI Server Started');
  console.log(`📚 Knowledge Base: ${knowledgeBase.length} categories`);
  console.log(`🤖 Chat Model: ${CHAT_MODEL}`);
  console.log(`👁️  Vision Model: ${VISION_MODEL}`);
  console.log('📤 Share: Ready');
  console.log('📄 Documents: Word, PDF, Excel, PowerPoint, TXT\n');
  console.log('🌐 Fungua kwenye browser:');
  console.log(`   ➜  ${link1}`);
  console.log(`   ➜  ${link2}\n`);
});