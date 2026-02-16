const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sendOtp = require("../utils/sendOtp");
const requireAuth = require("../middleware/requireAuth");

/* SIGNUP */
router.post("/signup", async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) {
    return res
      .status(400)
      .json({ error: "email, username and password are required" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    const user = await User.create({
      email,
      username,
      passwordHash,
      otp,
      otpExpiry,
      otpVerified: false,
    });

    // best-effort OTP send
    try {
      await sendOtp(user.email, otp, "Signup OTP");
    } catch (e) {
      console.error("OTP send failed:", e);
    }

    return res.json({ ok: true, message: "OTP sent", email: user.email });
  } catch (err) {
    console.error("Signup error:", err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || "value";
      return res.status(400).json({ error: `${field} already registered` });
    }
    return res
      .status(500)
      .json({ error: "Something went wrong while creating user" });
  }
});

/* VERIFY SIGNUP OTP */
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp)
    return res.status(400).json({ error: "email and otp required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "Invalid email address" });

  if (user.otp !== otp) return res.status(400).json({ error: "Incorrect OTP" });
  if (user.otpExpiry < new Date())
    return res.status(400).json({ error: "OTP expired" });

  user.otpVerified = true;
  user.otp = null;
  user.otpExpiry = null;
  await user.save();

  // demo token = userId (replace with JWT in production)
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  if (req.session) req.session.userId = user._id;

  return res.json({
    ok: true,
    token,
    user: { id: user._id, email: user.email, username: user.username },
  });
});

/* LOGIN */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email and password required" });

  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res
      .status(400)
      .json({ error: "No user found or incorrect password" });
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  if (req.session) req.session.userId = user._id;

  return res.json({
    ok: true,
    token,
    user: { id: user._id, username: user.username, email: user.email },
  });
});

/* FORGOT (send OTP) */
router.post("/forgot", async (req, res) => {
  const { emailOrUsername } = req.body;
  if (!emailOrUsername)
    return res.status(400).json({ error: "emailOrUsername required" });

  const user = await User.findOne({
    $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
  });
  if (!user)
    return res
      .status(404)
      .json({ error: "No user found with that email or username" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

  user.otp = otp;
  user.otpExpiry = otpExpiry;
  await user.save();

  try {
    await sendOtp(user.email, otp, "Password Reset OTP");
  } catch (e) {
    console.error("OTP send failed:", e);
  }

  return res.json({ ok: true, message: "OTP sent", email: user.email });
});

/* VERIFY FORGOT OTP */
router.post("/forgot/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp)
    return res.status(400).json({ error: "email and otp required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.otp !== otp) return res.status(400).json({ error: "Incorrect OTP" });
  if (user.otpExpiry < new Date())
    return res.status(400).json({ error: "OTP expired" });

  return res.json({ ok: true, message: "OTP verified" });
});

/* RESET PASSWORD */
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword)
    return res
      .status(400)
      .json({ error: "email, otp and newPassword required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.otp !== otp) return res.status(400).json({ error: "Incorrect OTP" });
  if (user.otpExpiry < new Date())
    return res.status(400).json({ error: "OTP expired" });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.otp = null;
  user.otpExpiry = null;
  await user.save();

  return res.json({ ok: true, message: "Password reset successful" });
});

/* LOGOUT */
router.post("/logout", (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err)
        return res.status(500).json({ error: "Error destroying session" });
      return res.json({ ok: true, message: "Logged out" });
    });
  } else {
    return res.json({
      ok: true,
      message: "Logged out (client should remove token)",
    });
  }
});

/* DELETE ACCOUNT */
router.post("/delete-account", requireAuth, async (req, res) => {
  const { password, confirmText } = req.body;
  if (!password || confirmText !== "DELETE") {
    return res
      .status(400)
      .json({ error: 'Provide password and type "DELETE" to confirm' });
  }

  try {
    const user = await User.findById(req.currentUser._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ error: "Incorrect password" });

    // Optional: delete user's posts if you want:
    // const Post = require('../models/Post');
    // await Post.deleteMany({ authorId: user._id });

    await User.findByIdAndDelete(user._id);

    if (req.session) {
      req.session.destroy((err) => {
        if (err) console.error("Session destroy error:", err);
      });
    }

    return res.json({ ok: true, message: "Account deleted" });
  } catch (error) {
    console.error("Delete account error:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
