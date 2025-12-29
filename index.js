require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');

const app = express();

// CORS for React dev server
const cors = require('cors');


app.use(
  cors({
    origin: true, // allow all origins in dev
    credentials: true,
  })
);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    // secure: true // enable in production when using HTTPS
    // sameSite: 'lax'
  }
}));

// Optional: attach current user into req if session is present
const User = require('./models/User');
app.use(async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const u = await User.findById(req.session.userId).lean();
      req.currentUser = u || null;
      res.locals.currentUser = u || null;
    } catch (err) {
      console.error('Error loading currentUser:', err);
      req.currentUser = null;
      res.locals.currentUser = null;
    }
  } else {
    req.currentUser = null;
    res.locals.currentUser = null;
  }
  next();
});

// Static folder (optional)
app.use(express.static(path.join(__dirname, 'public')));

// Routes (React frontend will call these under /api/*)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/feed', require('./routes/feed'));
app.use('/api/people', require('./routes/people'));

// In production serve React build
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, 'client', 'build');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('API running'));
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
