const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Data files
const CONTENT_FILE = path.join(__dirname, 'data', 'content.json');
const ADMIN_FILE = path.join(__dirname, 'data', 'admin.json');

// File upload config
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(12).toString('hex');
    cb(null, name + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Session token storage (simple)
let sessionToken = null;

// Auth middleware
function requireAuth(req, res, next) {
  const publicPaths = ['/api/login', '/api/check-auth'];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  if (req.method === 'GET' && req.path === '/api/content') {
    return next();
  }
  const token = req.headers.authorization || req.query.token;
  if (token && token === sessionToken) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(requireAuth);

// Load content
function loadContent() {
  try {
    const data = fs.readFileSync(CONTENT_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveContent(data) {
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ============ API ROUTES ============

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
    if (username === admin.username && password === admin.password) {
      sessionToken = crypto.randomBytes(32).toString('hex');
      return res.json({ success: true, token: sessionToken });
    }
  } catch {}
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  sessionToken = null;
  res.json({ success: true });
});

// Check auth
app.get('/api/check-auth', (req, res) => {
  res.json({ authenticated: sessionToken !== null });
});

// Get all content
app.get('/api/content', (req, res) => {
  const content = loadContent();
  res.json(content);
});

// Update site settings
app.put('/api/content/site', (req, res) => {
  const content = loadContent();
  content.site = { ...content.site, ...req.body };
  saveContent(content);
  res.json({ success: true });
});

// Upload image
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url, filename: req.file.filename });
});

// Delete uploaded image
app.delete('/api/upload/:filename', (req, res) => {
  const filepath = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// CRUD - Work items
app.get('/api/content/work', (req, res) => {
  const content = loadContent();
  res.json(content.work || []);
});

app.post('/api/content/work', (req, res) => {
  const content = loadContent();
  const work = content.work || [];
  const maxId = work.reduce((max, w) => Math.max(max, w.id), 0);
  const newItem = { id: maxId + 1, ...req.body };
  work.push(newItem);
  content.work = work;
  saveContent(content);
  res.json({ success: true, item: newItem });
});

app.put('/api/content/work/:id', (req, res) => {
  const content = loadContent();
  const work = content.work || [];
  const idx = work.findIndex(w => w.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  work[idx] = { ...work[idx], ...req.body };
  content.work = work;
  saveContent(content);
  res.json({ success: true, item: work[idx] });
});

app.delete('/api/content/work/:id', (req, res) => {
  const content = loadContent();
  content.work = (content.work || []).filter(w => w.id !== parseInt(req.params.id));
  saveContent(content);
  res.json({ success: true });
});

// Get uploaded files list
app.get('/api/uploads', (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) return res.json([]);
  const files = fs.readdirSync(uploadDir).map(f => ({
    name: f,
    url: `/uploads/${f}`,
    size: fs.statSync(path.join(uploadDir, f)).size
  }));
  res.json(files);
});

// ============ STATIC PAGES ============

// Serve admin panel
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// For SPA-like admin routing - serve index.html for any /admin subpath
app.get(/^\/admin(?:\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Serve main index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n  🚀 Server running at: http://localhost:${PORT}`);
  console.log(`  📝 Admin panel at: http://localhost:${PORT}/admin`);
  console.log();
});
