const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// CONNECT SUPABASE
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// EMAIL SETUP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.ADMIN_EMAIL, pass: process.env.ADMIN_PASS }
});
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

async function sendSellerEmail(to, subject, text){
  try{ await transporter.sendMail({ from: `WebMarket <${ADMIN_EMAIL}>`, to, subject, text }); }
  catch(e){ console.log("Email error:", e) }
}

// LOGIN / REGISTER
app.post('/api/login', async (req,res)=>{
  let {email, phrase} = req.body;
  if(!email || phrase.split(" ").length!= 3) return res.json({error:"Need valid email + 3 word phrase"});

  let {data: user} = await supabase.from('users').select('*').eq('email', email).single();
  if(!user){
    user = {
      email, phrase,
      sellerId: "WM"+Math.floor(1000+Math.random()*9000),
      status: "trial",
      planEnd: Date.now() + 7*24*60*60*1000,
      createdAt: Date.now()
    };
    await supabase.from('users').insert([user]);
  }
  res.json(user);
});

// GET USER
app.get('/api/user', async (req,res)=>{
  let {data: user} = await supabase.from('users').select('*').eq('email', req.query.email).single();
  res.json(user);
});

// SUBMIT PAYMENT
app.post('/api/payment', async (req,res)=>{
  let {email, sellerId, txid, amount, duration} = req.body;
  await supabase.from('payments').insert([{email, sellerId, txid, amount, duration, status:"pending", createdAt:Date.now()}]);

  transporter.sendMail({ 
    to: ADMIN_EMAIL, 
    subject: `New Payment: ${sellerId}`, 
    text: `Email: ${email}\nSellerID: ${sellerId}\nAmount: ${amount}\nDuration: ${duration}\nTxID: ${txid}` 
  });
  res.json({ok:true});
});

// ADMIN APPROVE PAYMENT
app.post('/api/admin/approve', async (req,res)=>{
  if(req.body.adminPass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  let {email, duration} = req.body;
  let months = { "1m":1, "3m":3, "5m":5, "1y":12 }[duration];
  let newEnd = Date.now() + months*30*24*60*60*1000;

  await supabase.from('users').update({status:"active", planEnd:newEnd}).eq('email', email);
  await supabase.from('payments').update({status:"approved"}).eq('email', email).eq('status','pending');

  sendSellerEmail(email, "WebMarket: Payment Approved ✅", `Your ${duration} plan is active. Plan ends: ${new Date(newEnd).toDateString()}`);
  res.json({ok:true});
});

// ADMIN REJECT PAYMENT
app.post('/api/admin/reject', async (req,res)=>{
  if(req.body.adminPass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  await supabase.from('payments').update({status:"rejected"}).eq('email', req.body.email).eq('status','pending');
  sendSellerEmail(req.body.email, "WebMarket: Payment Rejected", `Reason: ${req.body.reason || "TxID not found"}\nWallet: ${process.env.WALLET}`);
  res.json({ok:true});
});

// GET PENDING PAYMENTS
app.get('/api/admin/payments', async (req,res)=>{
  if(req.query.pass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  let {data} = await supabase.from('payments').select('*').eq('status','pending').order('createdAt', {ascending:false});
  res.json(data);
});

// GET PENDING LISTINGS
app.get('/api/admin/listings', async (req,res)=>{
  if(req.query.pass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  let {data} = await supabase.from('listings').select('*').eq('status','pending').order('createdAt', {ascending:false});
  res.json(data);
});

// APPROVE LISTING
app.post('/api/admin/approveListing', async (req,res)=>{
  if(req.body.adminPass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  let {data:listing} = await supabase.from('listings').select('*').eq('id', req.body.id).single();
  await supabase.from('listings').update({status:"approved"}).eq('id', req.body.id);
  sendSellerEmail(listing.sellerEmail, "WebMarket: Listing Approved ✅", `Your listing "${listing.name}" is now LIVE.`);
  res.json({ok:true});
});

// REJECT LISTING
app.post('/api/admin/rejectListing', async (req,res)=>{
  if(req.body.adminPass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  let {data:listing} = await supabase.from('listings').select('*').eq('id', req.body.id).single();
  await supabase.from('listings').update({status:"rejected"}).eq('id', req.body.id);
  sendSellerEmail(listing.sellerEmail, "WebMarket: Listing Rejected", `Reason: ${req.body.reason || "Does not follow rules"}`);
  res.json({ok:true});
});

// POST LISTING
app.post('/api/post', async (req,res)=>{
  let {data: user} = await supabase.from('users').select('*').eq('email', req.body.sellerEmail).single();
  if(!user) return res.json({error:"User not found"});
  if(user.status!="active" && Date.now() > user.planEnd) return res.json({error:"Plan expired. Please upgrade."});

  await supabase.from('listings').insert([{...req.body, status:"pending", createdAt:Date.now()}]);
  res.json({ok:true});
});

// GET APPROVED LISTINGS
app.get('/api/listings', async (req,res)=>{
  let {data} = await supabase.from('listings').select('*').eq('status','approved').order('createdAt', {ascending:false});
  res.json(data);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log("Server running on "+PORT));