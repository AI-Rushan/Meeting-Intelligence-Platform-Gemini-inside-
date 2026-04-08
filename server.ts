import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize SQLite DB
const db = new Database('database.sqlite');
db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT,
    date TEXT,
    transcription TEXT,
    summary TEXT,
    tasks TEXT,
    speakers TEXT,
    chat_history TEXT DEFAULT '[]'
  );
`);

// Try to add chat_history column if it doesn't exist (for existing DBs)
try {
  db.exec(`ALTER TABLE meetings ADD COLUMN chat_history TEXT DEFAULT '[]'`);
} catch (e) {
  // Column already exists
}

const upload = multer({ dest: 'uploads/' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// API Routes

app.get('/api/meetings', (req, res) => {
  const meetings = db.prepare('SELECT id, title, date FROM meetings ORDER BY date DESC').all();
  res.json(meetings);
});

app.get('/api/meetings/:id', (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (meeting) {
    meeting.transcription = JSON.parse(meeting.transcription);
    meeting.summary = JSON.parse(meeting.summary);
    meeting.tasks = JSON.parse(meeting.tasks);
    meeting.speakers = JSON.parse(meeting.speakers);
    meeting.chat_history = JSON.parse(meeting.chat_history || '[]');
    res.json(meeting);
  } else {
    res.status(404).json({ error: 'Meeting not found' });
  }
});

app.post('/api/meetings', (req, res) => {
  const data = req.body;
  
  // Ensure task IDs
  data.tasks = data.tasks.map((t: any) => ({ ...t, id: t.id || uuidv4(), status: t.status || 'new' }));

  // Extract unique speakers
  const uniqueSpeakers = [...new Set(data.transcription.map((t: any) => t.speaker))];
  const speakersMap = uniqueSpeakers.reduce((acc: any, speaker: any) => {
    acc[speaker] = speaker;
    return acc;
  }, {});

  const meetingId = uuidv4();
  const date = new Date().toISOString();

  db.prepare(`
    INSERT INTO meetings (id, title, date, transcription, summary, tasks, speakers)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    meetingId,
    data.title || 'Untitled Meeting',
    date,
    JSON.stringify(data.transcription),
    JSON.stringify(data.summary),
    JSON.stringify(data.tasks),
    JSON.stringify(speakersMap)
  );

  res.json({ id: meetingId });
});

app.post('/api/meetings/:id/speakers', (req, res) => {
  const { speakers } = req.body;
  db.prepare('UPDATE meetings SET speakers = ? WHERE id = ?').run(JSON.stringify(speakers), req.params.id);
  res.json({ success: true });
});

app.post('/api/meetings/:id/tasks', (req, res) => {
  const { tasks } = req.body;
  db.prepare('UPDATE meetings SET tasks = ? WHERE id = ?').run(JSON.stringify(tasks), req.params.id);
  res.json({ success: true });
});

// Removed /api/upload endpoint as it is now handled in the frontend
app.post('/api/meetings/:id/chat_history', (req, res) => {
  const { history } = req.body;
  db.prepare('UPDATE meetings SET chat_history = ? WHERE id = ?').run(JSON.stringify(history), req.params.id);
  res.json({ success: true });
});

// Removed /api/meetings/:id/chat endpoint as it is now handled in the frontend

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
