import { Router, Request, Response } from "express";
import nodemailer from "nodemailer";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

export const contactRouter = Router();

dotenv.config();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many contact submissions, please try again later." },
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/contact/
contactRouter.post("/", contactLimiter, async (req: Request, res: Response) => {
  const rawName = req.body.name;
  const rawEmail = req.body.email;
  const rawSubject = req.body.subject;
  const rawMessage = req.body.message;

  if (!rawName || !rawEmail || !rawSubject || !rawMessage) {
    res
      .status(400)
      .json({ error: "Name, email, subject, and message are required." });
    return;
  }
  if (
    typeof rawName !== "string" ||
    typeof rawEmail !== "string" ||
    typeof rawSubject !== "string" ||
    typeof rawMessage !== "string"
  ) {
    res.status(400).json({
      error: "Name, email, subject, and message must be strings.",
    });
    return;
  }

  if (rawName.length > 100) {
    res.status(400).json({ error: "Name must be 100 characters or fewer." });
    return;
  }
  if (rawEmail.length > 255) {
    res.status(400).json({ error: "Email must be 255 characters or fewer." });
    return;
  }
  if (rawSubject.length > 120) {
    res.status(400).json({ error: "Subject must be 120 characters or fewer." });
    return;
  }
  if (rawMessage.length > 2000) {
    res
      .status(400)
      .json({ error: "Message must be 2000 characters or fewer." });
    return;
  }

  // Validate email format
  if (!emailRegex.test(rawEmail)) {
    res.status(400).json({ error: "Invalid email format." });
    return;
  }

  const name = rawName.trim();
  const email = rawEmail.trim();
  const subject = rawSubject.trim();
  const message = rawMessage.trim();

  // SMTP
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const contactToEmail =
    process.env.CONTACT_TO_EMAIL || "foodieflip.dev@gmail.com";

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error("SMTP configuration missing in environment variables");
    res.status(500).json({ error: "Email service not available." });
    return;
  }

  // Create nodemailer transporter
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  try {
    const mailOptions = {
      from: `"${name}" <${smtpUser}>`,
      to: contactToEmail,
      replyTo: email,
      subject: `Contact Form: ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `
          <h3>Contact Form Submission</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, "<br />")}</p>
        `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log(
      "Contact form email sent successfully. Message ID:",
      info.messageId,
    );

    res
      .status(200)
      .json({ message: "Your message has been sent successfully." });
  } catch (error) {
    console.error("Failed to send contact form email:", error);
    res
      .status(500)
      .json({ error: "Failed to send message. Please try again later." });
  }
});
