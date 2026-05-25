const { Router } = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);

  // Create classroom
  router.post('/', auth, teacherOnly, (req, res) => {
    const { id, name } = req.body;
    if (!id || !name) return res.status(400).json({ error: '请填写教室ID和名称' });

    const existing = db.prepare('SELECT id FROM classrooms WHERE id = ?').get(id);
    if (existing) return res.status(400).json({ error: '教室ID已存在' });

    db.prepare('INSERT INTO classrooms (id, name, owner) VALUES (?, ?, ?)').run(id, name, req.session.teacher_username);
    db.prepare('INSERT INTO game_state (classroom_id) VALUES (?)').run(id);

    res.json({ id, name, owner: req.session.teacher_username });
  });

  // List classrooms for current teacher
  router.get('/', auth, teacherOnly, (req, res) => {
    const classes = db.prepare('SELECT * FROM classrooms WHERE owner = ?').all(req.session.teacher_username);
    res.json(classes);
  });

  // Get classroom detail (teacher or student of that class)
  router.get('/:id', auth, (req, res) => {
    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(req.params.id);
    if (!classroom) return res.status(404).json({ error: '教室不存在' });

    const teams = db.prepare('SELECT * FROM teams WHERE classroom_id = ?').all(req.params.id);
    const participants = db.prepare('SELECT * FROM participants WHERE classroom_id = ?').all(req.params.id);
    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(req.params.id);
    const news = db.prepare('SELECT * FROM news_log WHERE classroom_id = ? ORDER BY id DESC LIMIT 20').all(req.params.id);

    res.json({ classroom, teams, participants, gameState, news });
  });

  // Delete classroom
  router.delete('/:id', auth, teacherOnly, (req, res) => {
    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(req.params.id);
    if (!classroom) return res.status(404).json({ error: '教室不存在' });
    if (classroom.owner !== req.session.teacher_username) {
      return res.status(403).json({ error: '只能删除自己创建的教室' });
    }

    const classId = req.params.id;
    db.prepare('DELETE FROM alliance_requests WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM alliances WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM offers WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM ratings WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM hidden_logs WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM news_log WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM results WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM decisions WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM participants WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM teams WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM game_state WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM classrooms WHERE id = ?').run(classId);

    res.json({ success: true });
  });

  return router;
};
