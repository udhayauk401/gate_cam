import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";

const uploadDirectory = path.resolve("uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const extensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"]
]);
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${extensions.get(file.mimetype)}`)
});

function fileFilter(predicate, message) {
  return (_req, file, callback) => {
    if (!predicate(file.mimetype)) {
      const error = new Error(message);
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  };
}

const limits = { fileSize: 5 * 1024 * 1024 };
export const upload = multer({
  storage,
  limits,
  fileFilter: fileFilter((type) => allowedTypes.has(type), "Only JPG, PNG, WebP, or PDF files up to 5 MB are allowed.")
});
export const imageUpload = multer({
  storage,
  limits,
  fileFilter: fileFilter((type) => ["image/jpeg", "image/png", "image/webp"].includes(type), "Only JPG, PNG, or WebP images up to 5 MB are allowed.")
});

export async function verifyUpload(req, res, next) {
  if (!req.file) return next();
  let handle;
  try {
    handle = await fs.promises.open(req.file.path, "r");
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const signatures = {
      "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      "image/png": bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      "image/webp": bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP",
      "application/pdf": bytes.subarray(0, 5).toString() === "%PDF-"
    };
    await handle.close();
    handle = undefined;
    if (!signatures[req.file.mimetype]) {
      await fs.promises.unlink(req.file.path);
      return res.status(400).json({ message: "The uploaded file content does not match its file type." });
    }
    return next();
  } catch (error) {
    if (handle) await handle.close();
    return next(error);
  }
}
