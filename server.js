const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // serves all html files

// ENV VARS - Set these in Render Dashboard
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL; // wmarket675@gmail.com
const ADMIN_PASS = process.env.ADMIN_PASS; // your 3 word phrase
const WALLET = process.env.WALLET; // Your TRON USDT wallet

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: ADMIN_EMAIL, pass: ADMIN_PASS }
});

// Health + Wallet + Chain info
app.get('/api/health', (req, res) => res.json({
  ok: true,
  wallet: WALLET,
  chain: "Tether USDT - TRON [TRC20]"
}));

// 1. Submit product
app.post('/api/submit', async (req, res) => {
  const { product_name, description, price, seller_email, payment_proof } = req.body;
  const { data, error } = await supabase.from('products').insert([{ product_name, description, price, seller_email, payment_proof, status: 'pending' }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// 2. Get approved products for homepage
app.get('/api/products', async (req, res) => {
  const { data, error } = await supabase.from('products').select('*').eq('status', 'approved').order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 3. Admin login - Only wmarket675@gmail.com + 3 word phrase
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid email or 3-word phrase' });
});

// 4. Get pending products
app.get('/api/admin/products', async (req, res) => {
  const { data, error } = await supabase.from('products').select('*').eq('status', 'pending').order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 5. Approve/Reject + Email seller
app.post('/api/admin/approve', async (req, res) => {
  const { id, action, seller_email, product_name } = req.body;
  const status = action === 'approve'? 'approved' : 'rejected';
  await supabase.from('products').update({ status }).eq('id', id);
  const subject = action === 'approve'? 'WebMarket Product Approved ✅' : 'WebMarket Product Rejected ❌';
  const text = action === 'approve'? `Your product "${product_name}" is approved and now live on WebMarket.` : `Your product "${product_name}" was rejected.`;
  await transporter.sendMail({ from: ADMIN_EMAIL, to: seller_email, subject, text });
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WebMarket Server running on ${PORT}`));