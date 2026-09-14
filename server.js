const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL; // wmarket675@gmail.com
const WALLET = process.env.WALLET;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: ADMIN_EMAIL, pass: process.env.ADMIN_PASS }
});

// Health + Wallet
app.get('/api/health', (req, res) => res.json({
  ok: true, wallet: WALLET, chain: "Tether USDT - TRON [TRC20]"
}));

// SIGNUP - saves 3 word phrase as password
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body; // password = 3 word phrase
  const hash = await bcrypt.hash(password, 10);
  const isAdmin = email === ADMIN_EMAIL;
  
  const { data, error } = await supabase.from('users').insert([{ email, password: hash, is_admin: isAdmin }]).select();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, isAdmin });
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: users } = await supabase.from('users').select('*').eq('email', email).limit(1);
  if(users.length === 0) return res.status(401).json({ error: 'User not found' });
  
  const user = users[0];
  const valid = await bcrypt.compare(password, user.password);
  if(!valid) return res.status(401).json({ error: 'Invalid 3-word phrase' });
  
  res.json({ success: true, isAdmin: user.is_admin });
});

// Submit product
app.post('/api/submit', async (req, res) => {
  const { product_name, description, price, seller_email, payment_proof } = req.body;
  const { data, error } = await supabase.from('products').insert([{ product_name, description, price, seller_email, payment_proof, status: 'pending' }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Get approved products
app.get('/api/products', async (req, res) => {
  const { data, error } = await supabase.from('products').select('*').eq('status', 'approved').order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get pending products - Admin only check
app.get('/api/admin/products', async (req, res) => {
  const { email } = req.query;
  if(email!== ADMIN_EMAIL) return res.status(403).json({ error: 'Not admin' });
  
  const { data, error } = await supabase.from('products').select('*').eq('status', 'pending').order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Approve/Reject
app.post('/api/admin/approve', async (req, res) => {
  const { id, action, seller_email, product_name, admin_email } = req.body;
  if(admin_email!== ADMIN_EMAIL) return res.status(403).json({ error: 'Not admin' });
  
  const status = action === 'approve'? 'approved' : 'rejected';
  await supabase.from('products').update({ status }).eq('id', id);
  const subject = action === 'approve'? 'Product Approved ✅' : 'Product Rejected ❌';
  const text = action === 'approve'? `Your product "${product_name}" is approved and now live.` : `Your product "${product_name}" was rejected.`;
  await transporter.sendMail({ from: ADMIN_EMAIL, to: seller_email, subject, text });
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));