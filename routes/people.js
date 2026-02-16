const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Post = require("../models/Post");
const requireAuth = require("../middleware/requireAuth");


/* GET /api/people (paginated list) */
const jwt = require("jsonwebtoken");

router.get("/", async (req, res) => {
  try {
    let currentUserId = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const payload = jwt.verify(
          authHeader.replace("Bearer ", ""),
          process.env.JWT_SECRET
        );
        currentUserId = payload.id;
      } catch {
        // invalid token → ignore
      }
    }

    const perPage = parseInt(req.query.perPage) || 10;
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / perPage);

    const usersRaw = await User.find()
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();

    const users = usersRaw.map((u) => ({
      id: u._id.toString(),
      username: u.username,
      email: u.email,
      followersCount: (u.followers || []).length,
      followingCount: (u.following || []).length,
    }));

    res.json({
      ok: true,
      users,
      currentPage: page,
      totalPages,
      perPage,
      currentUser: currentUserId,
    });
  } catch (err) {
    console.error("People list error:", err);
    res.status(500).json({ error: "Something went wrong while fetching users." });
  }
});


/* GET /api/people/:id (profile + posts) */
router.get("/:id", async (req, res) => {
  try {
    let currentUserId = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const payload = jwt.verify(
          authHeader.replace("Bearer ", ""),
          process.env.JWT_SECRET
        );
        currentUserId = payload.id;
      } catch {}
    }

    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const postsRaw = await Post.find({ authorId: user._id })
      .sort({ createdAt: -1 })
      .lean();

    const posts = postsRaw.map((p) => ({
      id: p._id.toString(),
      content: p.content,
      authorId: p.authorId.toString(),
      likes: (p.likes || []).map((id) => id.toString()),
      edited: !!p.edited,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    let isFollowing = false;
    if (currentUserId) {
      const followerIds = (user.followers || []).map((f) => f.toString());
      isFollowing = followerIds.includes(currentUserId);
    }

    res.json({
      ok: true,
      user: {
        id: user._id.toString(),
        username: user.username,
        followersCount: (user.followers || []).length,
        followingCount: (user.following || []).length,
      },
      posts,
      isFollowing,
      currentUser: currentUserId,
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Something went wrong while loading profile." });
  }
});


/* POST /api/people/:id/follow (follow user) */
router.post("/:id/follow", requireAuth, async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.id);
    if (!userToFollow)
      return res.status(404).json({ error: "User to follow not found" });

    const currentUser = await User.findById(req.currentUser._id);

    if (currentUser._id.toString() === userToFollow._id.toString())
      return res.status(400).json({ error: "You cannot follow yourself" });

    const alreadyFollowing = (currentUser.following || [])
      .map((f) => f.toString())
      .includes(userToFollow._id.toString());

    if (!alreadyFollowing) {
      currentUser.following.push(userToFollow._id);
      userToFollow.followers.push(currentUser._id);
      await currentUser.save();
      await userToFollow.save();
    }

    return res.json({
      ok: true,
      message: alreadyFollowing ? "Already following" : "Followed",
      isFollowing: true,
      followersCount: (userToFollow.followers || []).length,
    });
  } catch (err) {
    console.error("Follow error:", err);
    res
      .status(500)
      .json({ error: "Something went wrong while following the user." });
  }
});

module.exports = router;
