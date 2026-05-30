const { Router } = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);

  // Submit yearly rating
  router.post('/yearly', auth, (req, res) => {
    if (!['student', 'teacher'].includes(req.session.user_type)) {
      return res.status(403).json({ error: '只有登录用户可以评分' });
    }

    const { ratings, year } = req.body;
    const yearInt = Number(year);
    if (!Array.isArray(ratings) || ratings.length === 0 || !Number.isInteger(yearInt) || yearInt < 1) {
      return res.status(400).json({ error: '缺少评分数据或年份不正确' });
    }

    const { classroom_id, participant_id } = req.session;
    let fromId;
    if (req.session.user_type === 'student') {
      const participant = db.prepare('SELECT student_id FROM participants WHERE id = ?').get(participant_id);
      if (!participant) return res.status(404).json({ error: '当前参与者不存在' });
      fromId = participant.student_id;
    } else {
      fromId = req.session.teacher_username || 'teacher';
    }

    const insert = db.prepare(`INSERT INTO ratings (classroom_id, from_id, to_id, type, score, year, quarter)
      VALUES (?, ?, ?, ?, ?, ?, 0)`);

    try {
      const tx = db.transaction(() => {
        const validTypes = ['public', 'secret'];
        ratings.forEach((r, index) => {
          const toId = r?.to_id ?? r?.toId;
          if (!r || toId == null || toId === '' || !r.type || !validTypes.includes(r.type)) {
            throw new Error(`无效评分条目 ${index + 1}`);
          }
          const score = Number(r.score);
          if (!Number.isInteger(score) || score < 0 || score > 100) {
            throw new Error(`无效评分条目 ${index + 1}`);
          }
          insert.run(classroom_id, fromId, toId, r.type, score, yearInt);
        });
      });
      tx();
    } catch (e) {
      return res.status(400).json({ error: '评分数据无效，请确认每一项均已填写且在0-100范围内' });
    }

    res.json({ success: true });
  });

  // Submit alliance rating
  router.post('/alliance', auth, (req, res) => {
    if (!['student', 'teacher'].includes(req.session.user_type)) {
      return res.status(403).json({ error: '只有登录用户可以评分' });
    }

    const { ratings, year, half } = req.body;
    if (!ratings || !year || !half) return res.status(400).json({ error: '缺少评分数据' });

    const { classroom_id, participant_id } = req.session;
    let fromId;
    if (req.session.user_type === 'student') {
      const participant = db.prepare('SELECT student_id FROM participants WHERE id = ?').get(participant_id);
      if (!participant) return res.status(404).json({ error: '当前参与者不存在' });
      fromId = participant.student_id;
    } else {
      fromId = req.session.teacher_username || 'teacher';
    }

    const insert = db.prepare(`INSERT INTO ratings (classroom_id, from_id, to_id, type, score, year, half)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);

    try {
      const tx = db.transaction(() => {
        for (const r of ratings) {
          const toId = r?.to_id ?? r?.toId;
          const score = Number(r.score);
          if (!r || toId == null || toId === '' || !r.type || typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 100) {
            throw new Error('无效评分条目');
          }
          insert.run(classroom_id, fromId, toId, r.type, score, year, half);
        }
      });
      tx();
    } catch (e) {
      return res.status(400).json({ error: '评分数据无效，请确认每一项均已填写且在0-100范围内' });
    }

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
