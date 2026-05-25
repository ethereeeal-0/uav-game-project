const { Router } = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);

  // Submit yearly rating
  router.post('/yearly', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '只有学生可以评分' });
    }

    const { ratings, year } = req.body;
    if (!ratings || !year) return res.status(400).json({ error: '缺少评分数据' });

    const { classroom_id, participant_id } = req.session;
    const participant = db.prepare('SELECT student_id FROM participants WHERE id = ?').get(participant_id);

    const insert = db.prepare(`INSERT INTO ratings (classroom_id, from_id, to_id, type, score, year, quarter)
      VALUES (?, ?, ?, ?, ?, ?, 0)`);

    const tx = db.transaction(() => {
      for (const r of ratings) {
        insert.run(classroom_id, participant.student_id, r.to_id, r.type, r.score, year);
      }
    });
    tx();

    res.json({ success: true });
  });

  // Submit alliance rating
  router.post('/alliance', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '只有学生可以评分' });
    }

    const { ratings, year, half } = req.body;
    if (!ratings || !year || !half) return res.status(400).json({ error: '缺少评分数据' });

    const { classroom_id, participant_id } = req.session;
    const participant = db.prepare('SELECT student_id FROM participants WHERE id = ?').get(participant_id);

    const insert = db.prepare(`INSERT INTO ratings (classroom_id, from_id, to_id, type, score, year, half)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);

    const tx = db.transaction(() => {
      for (const r of ratings) {
        insert.run(classroom_id, participant.student_id, r.to_id, r.type, r.score, year, half);
      }
    });
    tx();

    res.json({ success: true });
  });

  // Check if rated this year
  router.get('/check/:year', auth, (req, res) => {
    if (req.session.user_type !== 'student') return res.json({ rated: false });

    const participant = db.prepare('SELECT student_id FROM participants WHERE id = ?').get(req.session.participant_id);
    const existing = db.prepare(
      "SELECT id FROM ratings WHERE classroom_id = ? AND from_id = ? AND year = ? AND type IN ('public','secret')"
    ).get(req.session.classroom_id, participant.student_id, parseInt(req.params.year));

    res.json({ rated: !!existing });
  });

  // Get all ratings (teacher)
  router.get('/classroom/:classId', auth, teacherOnly, (req, res) => {
    const ratings = db.prepare('SELECT * FROM ratings WHERE classroom_id = ? ORDER BY created_at DESC')
      .all(req.params.classId);
    res.json(ratings);
  });

  return router;
};
