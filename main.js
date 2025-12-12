const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const multer = require("multer");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

// =====================
// Commander (з Частини 1)
// =====================
const program = new Command();

program
  .requiredOption("-h, --host <host>", "Server host")
  .requiredOption("-p, --port <port>", "Server port")
  .requiredOption("-c, --cache <path>", "Cache directory");

program.parse(process.argv);
const opts = program.opts();

const HOST = opts.host;
const PORT = parseInt(opts.port, 10);
const CACHE_DIR = path.resolve(process.cwd(), opts.cache);

// Створення cache директорії
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Файл для збереження інвентаря
const DATA_FILE = path.join(CACHE_DIR, "inventory.json");

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// =====================
// Express
// =====================
const app = express();

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================
// Multer для фото
// =====================
const photosDir = path.join(CACHE_DIR, "photos");

if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, photosDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const upload = multer({ storage });

// =====================
// POST /register
// =====================

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нового предмета
 *     description: Додає новий предмет до інвентаря з назвою, описом та необовʼязковим фото.
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Назва предмета
 *               description:
 *                 type: string
 *                 description: Опис предмета
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Фото предмета
 *     responses:
 *       201:
 *         description: Предмет успішно створено
 *       400:
 *         description: Не передано назву предмета
 */

app.post("/register", upload.single("photo"), (req, res) => {
  const inventoryName = req.body.inventory_name;
  const description = req.body.description || "";
  const photo = req.file ? req.file.filename : null;

  // Перевірка обов'язкового поля
  if (!inventoryName) {
    return res.status(400).json({ error: "inventory_name is required" });
  }

  // Читаємо з файлу
  const items = JSON.parse(fs.readFileSync(DATA_FILE));

  // Створюємо новий об'єкт
  const newItem = {
    id: Date.now().toString(),
    name: inventoryName,
    description,
    photo
  };

  items.push(newItem);
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));

  return res.status(201).json(newItem);
});

// =====================
// GET /inventory
// =====================

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати весь інвентар
 *     description: Повертає список усіх предметів інвентаря.
 *     responses:
 *       200:
 *         description: Успішне отримання списку
 */

app.get("/inventory", (req, res) => {
  const items = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  res.status(200).json(items);
});

// =====================
// GET /inventory/:id
// =====================

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати предмет за ID
 *     description: Повертає один предмет інвентаря за його унікальним ідентифікатором.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID предмета
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Предмет знайдено
 *       404:
 *         description: Предмет не знайдено
 */

app.get("/inventory/:id", (req, res) => {
  const id = req.params.id;

  const items = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  const item = items.find(x => x.id === id);

  if (!item) {
    return res.status(404).json({ error: "Not found" });
  }

  res.status(200).json(item);
});

// =====================
// PUT /inventory/:id
// =====================

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновити предмет інвентаря
 *     description: Оновлює назву та/або опис предмета.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID предмета
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Нова назва
 *               description:
 *                 type: string
 *                 description: Новий опис
 *     responses:
 *       200:
 *         description: Предмет оновлено
 *       404:
 *         description: Предмет не знайдено
 */

app.put("/inventory/:id", (req, res) => {
  const id = req.params.id;
  const { name, description } = req.body;

  const items = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  const itemIndex = items.findIndex(x => x.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  // Оновлюємо тільки те, що передали
  if (name !== undefined) {
    items[itemIndex].name = name;
  }

  if (description !== undefined) {
    items[itemIndex].description = description;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));

  res.status(200).json(items[itemIndex]);
});

// =====================
// GET /inventory/:id/photo
// =====================

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото предмета
 *     description: Повертає зображення предмета за його ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID предмета
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Фото успішно отримано
 *       404:
 *         description: Фото або предмет не знайдено
 */

app.get("/inventory/:id/photo", (req, res) => {
  const id = req.params.id;

  const items = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  const item = items.find(x => x.id === id);

  // Якщо предмет не знайдено
  if (!item) {
    return res.status(404).json({ error: "Not found" });
  }

  // Якщо фото відсутнє
  if (!item.photo) {
    return res.status(404).json({ error: "Photo not found" });
  }

  const photoPath = path.join(CACHE_DIR, "photos", item.photo);

  // Якщо файл фізично не існує
  if (!fs.existsSync(photoPath)) {
    return res.status(404).json({ error: "Photo file missing" });
  }

  // Відправляємо файл
  res.setHeader("Content-Type", "image/jpeg");
  res.status(200).sendFile(photoPath);
});

// =====================
// PUT /inventory/:id/photo
// =====================

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновити фото предмета
 *     description: Завантажує нове фото для предмета.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID предмета
 *         schema:
 *           type: string
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       404:
 *         description: Предмет не знайдено
 */

app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const id = req.params.id;

  // Фото обовʼязкове
  if (!req.file) {
    return res.status(400).json({ error: "Photo is required" });
  }

  const items = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  const itemIndex = items.findIndex(x => x.id === id);

  // Якщо предмет не знайдено
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  const oldPhoto = items[itemIndex].photo;

  // Якщо було старе фото — видаляємо його
  if (oldPhoto) {
    const oldPhotoPath = path.join(CACHE_DIR, "photos", oldPhoto);
    if (fs.existsSync(oldPhotoPath)) {
      fs.unlinkSync(oldPhotoPath);
    }
  }

  // Записуємо нове фото
  items[itemIndex].photo = req.file.filename;

  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));

  res.status(200).json(items[itemIndex]);
});

// =====================
// DELETE /inventory/:id
// =====================

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити предмет інвентаря
 *     description: Видаляє предмет та його фото.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID предмета
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Предмет видалено
 *       404:
 *         description: Предмет не знайдено
 */

app.delete("/inventory/:id", (req, res) => {
  const id = req.params.id;

  const items = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  const itemIndex = items.findIndex(x => x.id === id);

  // Якщо предмет не знайдено
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  const deletedItem = items[itemIndex];

  // Видаляємо фото, якщо воно є
  if (deletedItem.photo) {
    const photoPath = path.join(CACHE_DIR, "photos", deletedItem.photo);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }
  }

  // Видаляємо сам запис
  items.splice(itemIndex, 1);

  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));

  res.status(200).json(deletedItem);
});

// =====================
// POST /search (by ID)
// =====================

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук предмета за ID
 *     description: Повертає предмет за його ідентифікатором.
 *     consumes:
 *       - application/x-www-form-urlencoded
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *               has_photo:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Предмет знайдено
 *       404:
 *         description: Предмет не знайдено
 */

app.post("/search", (req, res) => {
  const { id, has_photo } = req.body || {};

  // ID обов'язковий
  if (!id || id.trim() === "") {
    return res.status(400).json({ error: "ID is required" });
  }

  const items = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const item = items.find(x => x.id === id);

  // Якщо річ не знайдена — 404 (за ТЗ)
  if (!item) {
    return res.status(404).json({ error: "Not found" });
  }

  // Копія об'єкта, щоб не ламати оригінал у файлі
  const result = { ...item };

  // has_photo приходить з форми як "on" або не приходить взагалі
  const hasPhotoFlag =
    typeof has_photo !== "undefined" &&
    has_photo !== "false" &&
    has_photo !== "0";

  if (hasPhotoFlag) {
    const photoUrl = `/inventory/${id}/photo`;
    result.description = (result.description || "") + `\nPhoto: ${photoUrl}`;
  }

  // Успішна відповідь — 200 і один об'єкт, а не масив
  return res.status(200).json(result);
});

// =====================
// SWAGGER
// =====================
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Сервіс інвентаря",
      version: "1.0.0",
      description: "Swagger-документація для лабораторної роботи №6"
    },
  },
  apis: [__filename],
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// =====================
// HTTP Server
// =====================
const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});

