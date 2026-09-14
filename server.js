const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // serves index.html and admin.html

// Render will inject these from Environment Variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASS;
const WALLET = process.env.WALLET;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Nodemailer setup - using Gmail. Change if you use another
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: ADMIN_EMAIL,
    pass: ADMIN_PASS // Use Gmail App Password
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, wallet: WALLET }));

// Submit product
app.post('/api/submit', async (req, res) => {
  const { product_name, description, price, seller_email, payment_proof } = req.body;
  const { data, error } = await supabase
    .from('products')
    .insert([{ product_name, description, price, seller_email, payment_proof, status: 'pending' }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// Get pending products
app.get('/api/admin/products', async (req, res) => {
  const { data, error } = await supabase.from('products').select('*').eq('status', 'pending');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Approve/Reject
app.post('/api/admin/approve', async (req, res) => {
  const { id, action, seller_email, product_name } = req.body;
  const status = action === 'approve' ? 'approved' : 'rejected';
  
  await supabase.from('products').update({ status }).eq('id', id);
  
  // Send email
  const subject = action === 'approve' ? 'Product Approved ✅' : 'Product Rejected ❌';
  const text = action === 'approve' 
    ? `Your product "${product_name}" is approved and now live.`
    : `Your product "${product_name}" was rejected.`;
    
  await transporter.sendMail({ from: ADMIN_EMAIL, to: seller_email, subject, text });
  
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));