const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');

/* Helpers (session or Bearer token) */
function extractToken(req) {
  const auth = (req.headers.authorization || '').trim();
  if (auth.startsWith('Bearer ')) return auth.replace('Bearer ', '').trim();
  if (req.session && req.session.userId) return req.session.userId.toString();
  return null;
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const user = await User.findById(token);
  if (!user) return res.status(401).json({ error: 'Invalid token / user not found' });

  req.currentUser = user;
  next();
}

/* GET /api/feed/ (feed from users you follow) */
router.get('/', requireAuth, async (req, res) => {
  try {
    const currentUser = req.currentUser;

    let posts = [];
    if (Array.isArray(currentUser.following) && currentUser.following.length > 0) {
      posts = await Post.find({ authorId: { $in: currentUser.following } })
        .sort({ createdAt: -1 })
        .populate('authorId', 'username _id')
        .lean();
    }

    posts = posts.filter((p) => p.authorId !== null);

    posts = posts.map((p) => ({
      id: p._id.toString(),
      content: p.content,
      likes: (p.likes || []).map((id) => id.toString()),
      edited: !!p.edited,
      author: { id: p.authorId._id.toString(), username: p.authorId.username },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    res.json({ ok: true, posts, currentUser: { id: currentUser._id.toString(), username: currentUser.username } });
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: 'Something went wrong while loading your feed.' });
  }
});

/* POST /api/feed/create (create a post) */
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim() === '') return res.status(400).json({ error: 'Post content cannot be empty.' });

    const post = await Post.create({ authorId: req.currentUser._id, content: content.trim() });

    const populated = await Post.findById(post._id).populate('authorId', 'username _id').lean();

    const normalized = {
      id: populated._id.toString(),
      content: populated.content,
      likes: (populated.likes || []).map((id) => id.toString()),
      edited: !!populated.edited,
      author: { id: populated.authorId._id.toString(), username: populated.authorId.username },
      createdAt: populated.createdAt,
      updatedAt: populated.updatedAt
    };

    res.status(201).json({ ok: true, post: normalized });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: 'Something went wrong while creating your post.' });
  }
});

/* POST /api/feed/:id/like (toggle like) */
router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.currentUser._id.toString();
    const already = post.likes.map((l) => l.toString()).includes(userId);

    if (already) {
      post.likes.pull(req.currentUser._id);
    } else {
      post.likes.push(req.currentUser._id);
    }

    await post.save();

    const likes = (post.likes || []).map((id) => id.toString());
    res.json({ ok: true, liked: !already, likesCount: likes.length, likes });
  } catch (err) {
    console.error('Error liking post:', err);
    res.status(500).json({ error: 'Something went wrong while updating like.' });
  }
});

/* PUT /api/feed/posts/:id (edit post) */
router.put('/posts/:id', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || content.trim() === '') return res.status(400).json({ error: 'Content required' });

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.authorId.toString() !== req.currentUser._id.toString()) return res.status(403).json({ error: 'Not authorized' });

  if (post.content !== content) {
    post.content = content;
    post.edited = true;
    await post.save();
  }

  return res.json({ ok: true, post });
});

/* DELETE /api/feed/posts/:id (delete post) */
router.delete('/posts/:id', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.authorId.toString() !== req.currentUser._id.toString()) return res.status(403).json({ error: 'Not authorized' });

  await Post.findByIdAndDelete(req.params.id);
  return res.json({ ok: true, message: 'Post deleted' });
});

module.exports = router;
