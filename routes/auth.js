const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const sendOtp = require("../utils/sendOtp");
const Post = require("../models/Post");

// -------- SIGNUP --------
router.get("/signup", (req, res) => res.render("signup"));

router.post("/signup", async (req, res) => {
  const { email, username, password } = req.body;

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

    await sendOtp(email, otp, "Signup OTP");
    return res.render("verifyOtp", { email, purpose: "signup" });
  } catch (err) {
    // Check if it’s a Mongo duplicate key error
    if (err.code === 11000) {
      let field = Object.keys(err.keyValue)[0]; // email or username
      return res.render("message", {
        title: "Oops",
        message: `${
          field.charAt(0).toUpperCase() + field.slice(1)
        } already registered`,
        redirect: "/signup",
        redirectText: "Back to Signup",
      });
    }

    // Other errors
    return res.render("message", {
      title: "Error",
      message: "Something went wrong. Please try again.",
      redirect: "/signup",
      redirectText: "Back to Signup",
    });
  }
});

// -------- LOGIN --------
router.get("/login", (req, res) => res.render("login"));

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.render("message", {
      title: "Oops",
      message: "No user found or incorrect password",
      redirect: "/login",
      redirectText: "Back to Login",
    });
  }

  // Direct login without OTP for now
  req.session.userId = user._id;
  return res.redirect("/feed");
});

// -------- VERIFY OTP (for Signup only) --------
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.render("message", {
      title: "Oops",
      message: "Invalid email address",
      redirect: "/login",
      redirectText: "Back to Login",
    });
  }

  if (user.otp !== otp) {
    return res.render("message", {
      title: "Oops",
      message: "Incorrect OTP",
      redirect: "/signup",
      redirectText: "Back to Signup",
    });
  }

  if (user.otpExpiry < new Date()) {
    return res.render("message", {
      title: "Oops",
      message: "OTP expired",
      redirect: "/signup",
      redirectText: "Back to Signup",
    });
  }

  user.otpVerified = true;
  user.otp = null;
  user.otpExpiry = null;
  await user.save();

  req.session.userId = user._id;
  return res.redirect("/feed");
});

// -------- FORGOT PASSWORD --------
// Step 1: Request OTP
router.get("/forgot", (req, res) => res.render("forgot"));

router.post("/forgot", async (req, res) => {
  const { emailOrUsername } = req.body;
  const user = await User.findOne({
    $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
  });

  if (!user) {
    return res.render("message", {
      title: "Oops",
      message: "No user found with that email or username",
      redirect: "/forgot",
      redirectText: "Back to Forgot Password",
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

  user.otp = otp;
  user.otpExpiry = otpExpiry;
  await user.save();

  await sendOtp(user.email, otp, "Password Reset OTP");

  return res.render("verifyOtpForgot", { email: user.email });
});

// Step 2: Verify OTP
router.post("/forgot/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.render("message", {
      title: "Oops",
      message: "User not found",
      redirect: "/forgot",
      redirectText: "Back to Forgot Password",
    });
  }

  if (user.otp !== otp) {
    return res.render("message", {
      title: "Oops",
      message: "Incorrect OTP",
      redirect: "/forgot",
      redirectText: "Back to Forgot Password",
    });
  }

  if (user.otpExpiry < new Date()) {
    return res.render("message", {
      title: "Oops",
      message: "OTP expired",
      redirect: "/forgot",
      redirectText: "Back to Forgot Password",
    });
  }

  return res.render("resetPassword", { email });
});

// Step 3: Reset Password
router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.render("message", {
      title: "Oops",
      message: "User not found",
      redirect: "/login",
      redirectText: "Back to Login",
    });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.otp = null;
  user.otpExpiry = null;
  await user.save();

  return res.render("message", {
    title: "Success",
    message: "Password reset successful",
    redirect: "/login",
    redirectText: "Back to Login",
  });
});

// -------- LOGOUT --------
router.get("/logout", (req, res) => {
  req.session.destroy();
  return res.redirect("/login");
});

// -------- DELETE ACCOUNT --------
// Confirm and delete account
// GET delete account page
router.get("/delete-account", async (req, res) => {
  if (!req.session.userId) {
    return res.render("message", {
      title: "Oops",
      message: "You must be logged in to delete your account.",
      redirect: "/login",
      redirectText: "Login",
    });
  }

  res.render("deleteAccount"); // render your EJS form page
});

router.post("/delete-account", async (req, res) => {
  const { password, confirmText } = req.body;

  if (!req.session.userId) {
    return res.render("message", {
      title: "Oops",
      message: "You must be logged in to delete your account.",
      redirect: "/login",
      redirectText: "Login",
    });
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.render("message", {
        title: "Error",
        message: "User not found.",
        redirect: "/feed",
        redirectText: "Back to Feed",
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.render("message", {
        title: "Incorrect Password",
        message: "Password you entered is incorrect.",
        redirect: "/delete-account",
        redirectText: "Try Again",
      });
    }

    // Check confirmation text
    if (confirmText !== "DELETE") {
      return res.render("message", {
        title: "Confirmation Required",
        message: 'You must type "DELETE" exactly to confirm account deletion.',
        redirect: "/delete-account",
        redirectText: "Try Again",
      });
    }

    // Delete the user
    await User.findByIdAndDelete(req.session.userId);

    // Clear session
    req.session.destroy((err) => {
      if (err) {
        return res.render("message", {
          title: "Error",
          message: "Something went wrong while logging out.",
          redirect: "/feed",
          redirectText: "Back to Feed",
        });
      }

      // Redirect to /people as non-logged-in user
      return res.redirect("/people");
    });
  } catch (error) {
    return res.render("message", {
      title: "Error",
      message: "Something went wrong. Please try again later.",
      redirect: "/feed",
      redirectText: "Back to Feed",
    });
  }
});

// Edit post (GET)
router.get("/edit/:id", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const post = await Post.findById(req.params.id);
  if (!post || post.authorId.toString() !== req.session.userId)
    return res.redirect("/feed");
  res.render("editPost", { post });
});

// Edit post (POST)
router.post("/edit/:id", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  const { content } = req.body;
  const post = await Post.findById(req.params.id);

  if (!post || post.authorId.toString() !== req.session.userId)
    return res.redirect("/feed");

  // Only update if content changed
  if (post.content !== content) {
    post.content = content;
    post.edited = true; // mark as edited
    await post.save();
  }

  res.redirect("/feed");
});

// Delete post
router.post("/delete/:id", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const post = await Post.findById(req.params.id);
  if (!post || post.authorId.toString() !== req.session.userId)
    return res.redirect("/feed");
  await Post.findByIdAndDelete(req.params.id);
  res.redirect("/feed");
});

module.exports = router;
