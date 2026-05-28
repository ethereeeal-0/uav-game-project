const crypto = require('crypto');
const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();

  function genToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function createSession(data) {
    const token = genToken();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO sessions (token, user_type, teacher_username, participant_id, classroom_id, team_id, role, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      token, data.user_type, data.teacher_username || null,
      data.participant_id || null, data.classroom_id || null,
      data.team_id || null, data.role || null, expires
    );
    return token;
  }

  // Teacher register
  router.post('/teacher/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请填写用户名和密码' });
    if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });

    const existing = db.prepare('SELECT id FROM teachers WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ error: '用户名已存在' });

    db.prepare('INSERT INTO teachers (username, password) VALUES (?, ?)').run(username, password);
    const token = createSession({ user_type: 'teacher', teacher_username: username });
    const classes = db.prepare('SELECT id, name FROM classrooms WHERE owner = ?').all(username);
    res.json({ token, teacher: { username, is_admin: 0, classes } });
  });

  // Teacher login
  router.post('/teacher/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请填写用户名和密码' });

    const teacher = db.prepare('SELECT * FROM teachers WHERE username = ? AND password = ?').get(username, password);
    if (!teacher) return res.status(401).json({ error: '用户名或密码错误' });

    const token = createSession({ user_type: 'teacher', teacher_username: username });
    const classes = db.prepare('SELECT id, name FROM classrooms WHERE owner = ?').all(username);
    res.json({ token, teacher: { username, is_admin: teacher.is_admin, classes } });
  });

  // Student login (join team)
  router.post('/student/login', (req, res) => {
    const { classroom_id, student_id, grade, gender, age, work_years, role_years, team_code, password, role } = req.body;
    if (!classroom_id || !student_id || !team_code || !password || !role) {
      return res.status(400).json({ error: '请填写完整信息' });
    }

    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(classroom_id);
    if (!classroom) return res.status(404).json({ error: '教室不存在' });

    const team = db.prepare('SELECT * FROM teams WHERE classroom_id = ? AND code = ? AND password = ?')
      .get(classroom_id, team_code, password);
    if (!team) return res.status(401).json({ error: '团队代码或密码错误' });

    // Find or create participant
    let participant = db.prepare(
      'SELECT * FROM participants WHERE student_id = ? AND classroom_id = ? AND team_id = ? AND role = ?'
    ).get(student_id, classroom_id, team.id, role);

    if (!participant) {
      db.prepare(`INSERT INTO participants (student_id, classroom_id, team_id, role, grade, gender, age, work_years, role_years)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        student_id, classroom_id, team.id, role,
        grade || null, gender || null, age || null, work_years || 0, role_years || 0
      );
      participant = db.prepare(
        'SELECT * FROM participants WHERE student_id = ? AND classroom_id = ? AND team_id = ? AND role = ?'
      ).get(student_id, classroom_id, team.id, role);
    }

    const token = createSession({
      user_type: 'student',
      participant_id: participant.id,
      classroom_id,
      team_id: team.id,
      role
    });

    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(classroom_id);
    res.json({ token, participant, team, gameState });
  });

  // Validate session
  router.get('/session', authMiddleware(db), (req, res) => {
    const s = req.session;
    if (s.user_type === 'teacher') {
      const teacher = db.prepare('SELECT username, is_admin FROM teachers WHERE username = ?').get(s.teacher_username);
      const classes = db.prepare('SELECT id, name FROM classrooms WHERE owner = ?').all(s.teacher_username);
      return res.json({ user_type: 'teacher', teacher: { ...teacher, classes } });
    }
    const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(s.participant_id);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(s.team_id);
    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(s.classroom_id);
    res.json({ user_type: 'student', participant, team, gameState, classroom_id: s.classroom_id });
  });

  // Switch student role within the same team/classroom
  router.post('/switch-role', authMiddleware(db), (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '需要学生身份' });
    }

    const { role } = req.body;
    const validRoles = ['CEO', 'CIO', 'COO', 'CFO', 'CMO', 'HR'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: '无效角色' });
    }

    const currentParticipant = db.prepare('SELECT * FROM participants WHERE id = ?').get(req.session.participant_id);
    if (!currentParticipant) {
      return res.status(404).json({ error: '当前参与者不存在' });
    }

    let participant = db.prepare(
      'SELECT * FROM participants WHERE student_id = ? AND classroom_id = ? AND team_id = ? AND role = ?'
    ).get(currentParticipant.student_id, req.session.classroom_id, req.session.team_id, role);

    if (!participant) {
      db.prepare(`INSERT INTO participants (student_id, classroom_id, team_id, role, grade, gender, age, work_years, role_years)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          currentParticipant.student_id,
          req.session.classroom_id,
          req.session.team_id,
          role,
          currentParticipant.grade,
          currentParticipant.gender,
          currentParticipant.age,
          currentParticipant.work_years || 0,
          currentParticipant.role_years || 0
        );
      participant = db.prepare(
        'SELECT * FROM participants WHERE student_id = ? AND classroom_id = ? AND team_id = ? AND role = ?'
      ).get(currentParticipant.student_id, req.session.classroom_id, req.session.team_id, role);
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      db.prepare('UPDATE sessions SET participant_id = ?, role = ? WHERE token = ?')
        .run(participant.id, role, token);
    }

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.session.team_id);
    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(req.session.classroom_id);
    res.json({ participant, team, gameState, classroom_id: req.session.classroom_id });
  });

  // Logout
  router.post('/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ success: true });
  });

  // Cleanup expired sessions periodically
  setInterval(() => {
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  }, 60 * 60 * 1000);

  return router;
};
