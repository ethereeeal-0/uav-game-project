const crypto = require('crypto');
const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);

  // Register new team
  router.post('/', (req, res) => {
    const { classroom_id, name, code, password } = req.body;
    if (!classroom_id || !name || !code || !password) {
      return res.status(400).json({ error: '请填写完整信息' });
    }

    const classroom = db.prepare('SELECT id FROM classrooms WHERE id = ?').get(classroom_id);
    if (!classroom) return res.status(404).json({ error: '教室不存在' });

    const existing = db.prepare('SELECT id FROM teams WHERE classroom_id = ? AND code = ?').get(classroom_id, code);
    if (existing) return res.status(400).json({ error: '该教室中团队代码已存在' });

    const id = Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    db.prepare(`INSERT INTO teams (id, classroom_id, name, code, password) VALUES (?, ?, ?, ?, ?)`)
      .run(id, classroom_id, name, code, password);

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
    res.json(team);
  });

  // Get teams in a classroom
  router.get('/classroom/:classId', auth, (req, res) => {
    const teams = db.prepare('SELECT * FROM teams WHERE classroom_id = ?').all(req.params.classId);
    res.json(teams);
  });

  // Get team detail
  router.get('/:id', auth, (req, res) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    if (!team) return res.status(404).json({ error: '团队不存在' });
    const members = db.prepare('SELECT * FROM participants WHERE team_id = ?').all(req.params.id);
    res.json({ team, members });
  });

  // Get team history (results)
  router.get('/:id/history', auth, (req, res) => {
    const results = db.prepare('SELECT * FROM results WHERE team_id = ? ORDER BY year DESC, quarter DESC')
      .all(req.params.id);
    res.json(results);
  });

  return router;
};
