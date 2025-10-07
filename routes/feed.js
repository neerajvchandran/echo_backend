const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Post = require("../models/Post");

// -------- FEED PAGE --------
// Show posts only from users the current user follows
router.get("/", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const currentUser = await User.findById(req.session.userId);
    if (!currentUser) return res.redirect("/login");

    let posts = [];
    if (currentUser.following.length > 0) {
      posts = await Post.find({ authorId: { $in: currentUser.following } })
        .sort({ createdAt: -1 }) // latest first
        .populate("authorId", "username _id") // only fetch username + id
        .lean();
    }

    // ✅ Filter out posts from deleted users
    posts = posts.filter((post) => post.authorId !== null);

    res.render("feed", { posts, currentUser });
  } catch (err) {
    console.error("Feed error:", err);
    res.render("message", {
      title: "Error",
      message: "Something went wrong while loading your feed.",
      redirect: "/login",
      redirectText: "Back to Login",
    });
  }
});

// -------- CREATE POST (GET) --------
router.get("/create", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.render("create");
});

// -------- CREATE POST (POST) --------
router.post("/create", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const { content } = req.body;
    if (!content || content.trim() === "") {
      return res.render("message", {
        title: "Oops",
        message: "Post content cannot be empty.",
        redirect: "/feed/create",
        redirectText: "Try Again",
      });
    }

    await Post.create({ authorId: req.session.userId, content });
    res.redirect("/feed");
  } catch (err) {
    console.error("Error creating post:", err);
    res.render("message", {
      title: "Error",
      message: "Something went wrong while creating your post.",
      redirect: "/feed",
      redirectText: "Back to Feed",
    });
  }
});

// -------- LIKE / UNLIKE POST --------
router.post("/:id/like", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.redirect("/feed");

    const userId = req.session.userId;

    if (post.likes.includes(userId)) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();
    res.redirect("/feed");
  } catch (err) {
    console.error("Error liking post:", err);
    res.render("message", {
      title: "Error",
      message: "Something went wrong while updating like.",
      redirect: "/feed",
      redirectText: "Back to Feed",
    });
  }
});

module.exports = router;
