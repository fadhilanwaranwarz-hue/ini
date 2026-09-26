const prisma  = require('../models/db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../middlewares/auth');

// ─── DASHBOARD ─────────────────────────────────────────────────────────────
exports.dashboard = async (req, res) => {
  const [voters, candidates, session] = await Promise.all([
    prisma.voter.findMany({ orderBy: { kelas: 'asc' } }),
    prisma.candidate.findMany({ orderBy: { nomorUrut: 'asc' } }),
    prisma.votingSession.findFirst(),
  ]);
  const hadir    = voters.filter(v => v.token !== null).length;
  const sudahVote = voters.filter(v => v.hasVoted).length;

  res.render('panitia/dashboard', {
    title: 'Dashboard Panitia TPS – E-Voting',
    voters, candidates, session, hadir, sudahVote,
  });
};

// ─── DAFTAR PEMILIH ─────────────────────────────────────────────────────────
exports.listVoters = async (req, res) => {
  const voters = await prisma.voter.findMany({ orderBy: { kelas: 'asc' } });
  const session = await prisma.votingSession.findFirst();
  res.render('panitia/voters', { title: 'Daftar Pemilih – Panitia', voters, session });
};

// ─── GENERATE TOKEN ─────────────────────────────────────────────────────────
exports.generateToken = async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const session = await prisma.votingSession.findFirst();
    if (!session?.isOpen) {
      req.flash('error', 'Sesi voting belum dibuka oleh admin. Token tidak dapat digenerate.');
      return res.redirect('/panitia/voters');
    }
    const voter = await prisma.voter.findUnique({ where: { id } });
    if (!voter) { req.flash('error', 'Pemilih tidak ditemukan.'); return res.redirect('/panitia/voters'); }
    if (voter.hasVoted) {
      req.flash('warning', `${voter.nama} sudah memberikan suara. Token tidak dapat digenerate ulang.`);
      return res.redirect('/panitia/voters');
    }
    
    // Generate token unik sekali pakai (8 karakter alphanumeric uppercase)
    let token;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      attempts++;
      token = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      const existing = await prisma.voter.findUnique({ where: { token } });
      if (!existing) isUnique = true;
    }

    await prisma.voter.update({ where: { id }, data: { token } });
    await logAudit(req, 'GENERATE_TOKEN', `Token "${token}" digenerate untuk pemilih "${voter.nama}" (NISN: ${voter.nisn}).`);
    req.flash('success', `Token untuk ${voter.nama}: <strong>${token}</strong> – Serahkan kepada pemilih.`);
    res.redirect('/panitia/voters');
  } catch (e) {
    req.flash('error', 'Gagal generate token: ' + e.message);
    res.redirect('/panitia/voters');
  }
};

// ─── QUICK COUNT ────────────────────────────────────────────────────────────
exports.quickCount = async (req, res) => {
  const [candidates, voters, session] = await Promise.all([
    prisma.candidate.findMany({ orderBy: { nomorUrut: 'asc' } }),
    prisma.voter.findMany(),
    prisma.votingSession.findFirst(),
  ]);
  const totalSuara = voters.filter(v => v.hasVoted).length;
  const totalDPT   = voters.length;
  res.render('shared/quick-count', {
    title: 'Live Count – Panitia',
    candidates, totalSuara, totalDPT, session,
    role: 'PANITIA_TPS',
  });
};

// ─── BERITA ACARA (Print) ────────────────────────────────────────────────────
exports.beritaAcara = async (req, res) => {
  const [candidates, voters, session, auditCount] = await Promise.all([
    prisma.candidate.findMany({ orderBy: { nomorUrut: 'asc' } }),
    prisma.voter.findMany({ orderBy: { kelas: 'asc' } }),
    prisma.votingSession.findFirst(),
    prisma.voteAudit.count(),
  ]);
  const totalSuara  = voters.filter(v => v.hasVoted).length;
  const totalDPT    = voters.length;
  const totalAbsen  = totalDPT - totalSuara;

  const maxSuara = Math.max(...candidates.map(c => c.suaraCount), 0);
  const topCandidates = candidates.filter(c => c.suaraCount === maxSuara && maxSuara > 0);
  const isTie = topCandidates.length > 1;
  const pemenang = isTie ? null : (topCandidates[0] || null);

  const nowDate     = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  res.render('panitia/berita-acara', {
    title: 'Berita Acara Rekapitulasi – Panitia',
    candidates, voters, session, auditCount,
    totalSuara, totalDPT, totalAbsen, pemenang, isTie, nowDate,
  });
};

// ─── VERIFIKASI MANUAL ───────────────────────────────────────────────────────
exports.verifikasiVoter = async (req, res) => {
  const nisn = (req.body.nisn || '').trim();
  if (!nisn) {
    req.flash('error', 'Masukkan nomor NISN pemilih terlebih dahulu.');
    return res.redirect('/panitia/voters');
  }
  try {
    const voter = await prisma.voter.findUnique({ where: { nisn } });
    if (!voter) {
      req.flash('error', `NISN ${nisn} tidak terdaftar dalam DPT.`);
    } else if (voter.hasVoted) {
      req.flash('warning', `${voter.nama} (${voter.nisn}) SUDAH memberikan suara.`);
    } else if (voter.token) {
      req.flash('info', `${voter.nama} sudah mendapat token. Token aktif: ${voter.token}`);
    } else {
      req.flash('success', `${voter.nama} (${voter.kelas}) – Belum memilih. Siap generate token.`);
    }
    res.redirect('/panitia/voters');
  } catch (e) {
    req.flash('error', 'Gagal verifikasi: ' + e.message);
    res.redirect('/panitia/voters');
  }
};

// ─── TAMBAH PEMILIH DPT BARU (DI MEJA TPS) ──────────────────────────────────
exports.doAddVoter = async (req, res) => {
  const { nisn, nama, kelas } = req.body;
  try {
    if (!nisn || !nama || !kelas) {
      req.flash('error', 'Semua kolom (NISN, Nama Lengkap, Kelas) wajib diisi.');
      return res.redirect('/panitia/voters');
    }
    const cleanNisn = nisn.trim();
    const cleanNama = nama.trim();
    const cleanKelas = kelas.trim();

    await prisma.voter.create({
      data: {
        nisn: cleanNisn,
        nama: cleanNama,
        kelas: cleanKelas,
      },
    });

    await logAudit(req, 'ADD_VOTER_TPS', `Panitia mendaftarkan pemilih baru "${cleanNama}" (NISN: ${cleanNisn}, Kelas: ${cleanKelas}).`);
    req.flash('success', `Pemilih baru <strong>${cleanNama}</strong> (${cleanNisn} - ${cleanKelas}) berhasil didaftarkan ke DPT. Silakan lakukan penerbitan token.`);
    res.redirect('/panitia/voters');
  } catch (e) {
    req.flash('error', 'Gagal mendaftarkan pemilih: ' + (e.code === 'P2002' ? 'NISN tersebut sudah terdaftar di DPT.' : e.message));
    res.redirect('/panitia/voters');
  }
};
