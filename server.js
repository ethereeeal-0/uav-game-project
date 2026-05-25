const express = require('express');
const path = require('path');
const getDb = require('./lib/db');

const db = getDb();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/classrooms', require('./routes/classrooms')(db));
app.use('/api/teams', require('./routes/teams')(db));
app.use('/api/decisions', require('./routes/decisions')(db));
app.use('/api/game', require('./routes/game')(db));
app.use('/api/ratings', require('./routes/ratings')(db));
app.use('/api/offers', require('./routes/offers')(db));
app.use('/api/alliances', require('./routes/alliances')(db));
app.use('/api/admin', require('./routes/admin')(db));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`UAV Game Server running on http://0.0.0.0:${PORT}`);
});
