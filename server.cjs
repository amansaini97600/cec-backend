const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const db = require("./db.cjs");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.execute("SELECT * FROM admins WHERE email = ?", [
      email,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({ message: "Email not found" });
    }

    const admin = rows[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    // console.log("Form Password:", password);

    //     console.log("Password Match?", isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );
    //     console.log("Form Email:", email);
    // console.log("DB Email:", admin.email);
    // console.log("DB Hash:", admin.password);

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/student_photos/"); // make sure this folder exists
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// POST route to add student
app.post("/api/admin/students", upload.single("photo"), async (req, res) => {
  const { name, father_name, address, phone, course, joined_date, aadhar } =
    req.body;
  const photo = req.file ? req.file.filename : null;

  try {
    await db.execute(
      `INSERT INTO students (name, father_name, address, phone, course, joined_date, aadhar, photo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, father_name, address, phone, course, joined_date, aadhar, photo]
    );
    res.status(200).json({ message: "Student added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add student" });
  }
});

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

app.get("/api/students", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM students ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching students" });
  }
});

app.put("/api/students/:id", verifyToken, async (req, res) => {
  const { name, father_name, phone, course, joined_date, address, aadhar } =
    req.body;
  const { id } = req.params;

  try {
    await db.execute(
      `UPDATE students SET name=?, father_name=?, phone=?, course=?, joined_date=?, address=?, aadhar=? WHERE id=?`,
      [name, father_name, phone, course, joined_date, address, aadhar, id]
    );
    res.json({ message: "Student updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

app.delete("/api/students/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    await db.execute("DELETE FROM students WHERE id = ?", [id]);
    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
});

app.get("/api/students", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const [students] = await db.execute(
      "SELECT * FROM students LIMIT ? OFFSET ?",
      [limit, offset]
    );
    const [[{ total }]] = await db.execute(
      "SELECT COUNT(*) as total FROM students"
    );

    res.json({ students, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// add certificates
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const cert_storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/cert_photos"); // make sure this folder exists
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const cert_upload = multer({ storage: cert_storage });

app.post(
  "/api/certificates",
  verifyToken,
  cert_upload.single("photo"),
  async (req, res) => {
    const {
      name,
      fatherName,
      course,
      duration,
      issueDate,
      certificateType,
      grade,
      aadharNumber,
      phoneNumber,
    } = req.body;

    const photoPath = req.file
      ? "/uploads/cert_photos/" + req.file.filename
      : null;
    console.log("Photo to send:", photoPath);

    try {
      const [result] = await db.execute(
        `INSERT INTO certificates 
        (name, father_name, course, duration, issue_date, type, grade,photo,aadhar,phone) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          fatherName,
          course,
          duration,
          issueDate,
          certificateType,
          grade,
          photoPath,
          aadharNumber,
          phoneNumber,
        ]
      );

      const newId = result.insertId;
      const certificateNumber = newId + 1200;

      // Update certificate_number
      await db.execute(
        "UPDATE certificates SET certificate_number = ? WHERE id = ?",
        [certificateNumber, newId]
      );

      // Send back the newly inserted certificate's ID
      res.json({
        message: "Certificate saved successfully",
        id: newId,
        certificateNumber,
      });
    } catch (err) {
      console.error("Insert error:", err);
      res.status(500).json({ message: "Database insert failed" });
    }
  }
);

// Backend route
app.get("/api/certificates/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.execute(
      "SELECT * FROM certificates WHERE id = ?",
      [id]
    );
    if (result.length === 0)
      return res.status(404).json({ message: "Not found" });
    res.json(result[0]);
  } catch (err) {
    console.error("Error in fetch by ID:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//todo search certificate list
app.get("/api/certificates", verifyToken, async (req, res) => {
  try {
    const [result] = await db.execute(
      "SELECT * FROM certificates ORDER BY id DESC"
    );
    res.json(result);
  } catch (err) {
    console.error("Fetch all error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// todo edit certificate
app.put(
  "/api/certificates/:id",
  verifyToken,
  cert_upload.single("photo"),
  async (req, res) => {
    const { id } = req.params;
    const {
      name,
      fatherName,
      course,
      duration,
      issueDate,
      certificateType,
      grade,
      certificateNumber,
      phoneNumber,
      aadharNumber,
    } = req.body;

    const photoPath = req.file
      ? "/uploads/cert_photos/" + req.file.filename
      : null;

    try {
      let query = `UPDATE certificates SET 
      name = ?, father_name = ?, course = ?, duration = ?, issue_date = ?, type = ?, grade = ?, certificate_number = ?, phone = ?, aadhar = ?`;

      const params = [
        name,
        fatherName,
        course,
        duration,
        issueDate,
        certificateType,
        grade,
        certificateNumber,
        phoneNumber,
        aadharNumber,
      ];

      if (photoPath) {
        query += `, photo = ?`;
        params.push(photoPath);
      }

      query += ` WHERE id = ?`;
      params.push(id);

      await db.execute(query, params);

      res.json({ message: "Certificate updated successfully" });
    } catch (err) {
      console.error("Update error:", err);
      res.status(500).json({ message: "Database update failed" });
    }
  }
);

// todo Diploma add
// 📁 server.cjs or your main backend file

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 🔧 Multer setup for photo upload
const diploma_storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/diploma_photos"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const diploma_upload = multer({ storage: diploma_storage });

// 📌 Utility functions
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateGrade(percentage) {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  return "D";
}

// 📥 POST /api/diplomas
app.post("/api/diplomas", diploma_upload.single("photo"), async (req, res) => {
  const {
    name,
    fatherName,
    course,
    institute,
    phone,
    aadhar,
    dateOfCompilation,
    dateOfGeneration,
  } = req.body;

  const subjects = ["A.C.C.", "D.C.A.", "D.T.P.", "TALLY 9.0", "TALLY 9.4"];

  const marks = [];
  let total = 0;
  subjects.forEach((subject) => {
    const t1 = getRandomInt(90, 98);
    const p1 = getRandomInt(40, 48);
    const t2 = getRandomInt(90, 98);
    const p2 = getRandomInt(40, 48);

    total += t1 + p1 + t2 + p2;

    marks.push({ term: "I", subject, theory: t1, practical: p1 });
    marks.push({ term: "II", subject, theory: t2, practical: p2 });
  });

  const percentage = parseFloat(((total / 1500) * 100).toFixed(2));
  const grade = generateGrade(percentage);

  const photoPath = req.file
    ? "/uploads/diploma_photos/" + req.file.filename
    : null;

  try {
    const [diplomaResult] = await db.execute(
      `INSERT INTO diplomas (name, father_name, course, institute, photo, compilation_date, generation_date, total, percentage, grade, diploma_number, phone, aadhar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        fatherName,
        course,
        institute,
        photoPath,
        dateOfCompilation,
        dateOfGeneration,
        total,
        percentage,
        grade,
        null, // placeholder for diploma_number
        phone,
        aadhar,
      ]
    );

    const diplomaId = diplomaResult.insertId;
    const diplomaNumber = 1200 + diplomaId;

    await db.execute(`UPDATE diplomas SET diploma_number = ? WHERE id = ?`, [
      diplomaNumber,
      diplomaId,
    ]);

    for (const m of marks) {
      await db.execute(
        `INSERT INTO diploma_marks (diploma_id, term, subject, theory, practical,diploma_number ) VALUES (?, ?, ?, ?, ?, ?)`,
        [diplomaId, m.term, m.subject, m.theory, m.practical, diplomaNumber]
      );
    }

    res.json({ message: "Diploma created", id: diplomaId });
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).json({ message: "Failed to insert diploma" });
  }
});

// Export or listen here if not already handled
module.exports = app;

// todo get diploma data
app.get("/api/diplomas/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.execute("SELECT * FROM diplomas WHERE id = ?", [
      id,
    ]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Diploma not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.error("Error fetching diploma:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/diplomas/:id/marks", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.execute(
      "SELECT * FROM diploma_marks WHERE diploma_id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No marks found" });
    }

    res.json(rows);
  } catch (err) {
    console.error("Error fetching diploma marks:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//todo diploma list
app.get("/api/diplomas", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM diplomas ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("Diploma fetch error:", err);
    res.status(500).json({ message: "Failed to fetch diplomas" });
  }
});

// todo edit diploma
app.put("/api/diplomas/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    father_name,
    course,
    phone,
    aadhar,
    compilation_date,
    generation_date,
  } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE diplomas 
       SET name = ?, father_name = ?, course = ?, phone = ?, aadhar = ?, compilation_date = ?, generation_date = ?
       WHERE id = ?`,
      [
        name,
        father_name,
        course,
        phone,
        aadhar,
        compilation_date,
        generation_date,
        id,
      ]
    );

    res.json({ message: "Diploma updated successfully" });
  } catch (err) {
    console.error("Error updating diploma:", err);
    res.status(500).json({ message: "Failed to update diploma" });
  }
});

// todo upload notes

// Serve uploaded files statically
app.use("/uploads/notes", express.static("uploads/notes"));

// Multer storage config
const notes_storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/notes");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const notes_upload = multer({ storage: notes_storage }); // ✅ Fixed here

// Route: Upload Notes
app.post("/api/notes", notes_upload.single("file"), async (req, res) => {
  const { title, subject } = req.body;
  const file = req.file;

  // console.log("title:", title);
  // console.log("subject:", subject);
  // console.log("file:", file); // ✅ Now this will NOT be undefined

  if (!file || !title || !subject) {
    return res.status(400).json({ error: "Missing title, subject, or file" });
  }

  try {
    const sql = "INSERT INTO notes (title, subject, filename) VALUES (?, ?, ?)";
    await db.execute(sql, [title, subject, file.filename]);
    res.status(201).json({ message: "Note uploaded successfully" });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// todo notes list

app.get("/api/notes", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM notes ORDER BY uploaded_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

//todo delete notes
app.delete("/api/notes/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.execute("DELETE FROM notes WHERE id = ?", [id]);
    res.json({ message: "Note deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// todo Download notes
const fs = require("fs");

app.get("/api/notes/download/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "uploads/notes", filename);

  // check if file exists
  if (fs.existsSync(filePath)) {
    res.download(filePath); // 🔥 This forces download
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// GET certificate by registration number
app.get("/api/certificates/search/:regNo", async (req, res) => {
  const { regNo } = req.params;
  try {
    const [result] = await db.execute(
      "SELECT * FROM certificates WHERE certificate_number = ?",
      [regNo]
    );

    if (result.length === 0) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
//todo diploma search student 

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.get("/api/diplomas/search/:id", async (req, res) => {
    const diplomaNumber = req.params.id;
    try {
        const [result] = await db.execute("SELECT * FROM diplomas WHERE diploma_number = ?", [diplomaNumber]);

        if (result.length === 0) {
            return res.status(404).json({ message: "Diploma not found" });
        }

        res.json(result[0]);
    } catch (err) {
        console.error("Error fetching diploma:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ✅ Get diploma marks by diploma_number (for student)
app.get("/api/diplomas/search/:id/marks", async (req, res) => {
    const diplomaNumber = req.params.id;
    try {
        const [marks] = await db.execute("SELECT * FROM diploma_marks WHERE diploma_number = ?", [diplomaNumber]);
        res.json(marks);
    } catch (err) {
        console.error("Error fetching marks:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Route using token
app.get("/api/admin/data", verifyToken, (req, res) => {
  res.json({ message: "Secure data" });
});
