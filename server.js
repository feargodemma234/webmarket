const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URL);

// MODELS
const User = mongoose.model('User', {
  email:String, phrase:String, sellerId:String,
  status:{type:String, default:"trial"},
  planEnd:Number, createdAt:{type:Number, default:Date.now()}
});

const Listing = mongoose.model('Listing', {
  sellerEmail:String, sellerId:String, name:String, desc:String,
  price:String, region:String, email:String, whatsapp:String, telegram:String,
  status:{type:String, default:"pending"}
});

const Payment = mongoose.model('Payment', {
  email:String, sellerId:String, txid:String, amount:String,
  duration:String, status:{type:String, default:"pending"}, createdAt:{type:Number, default:Date.now()}
});

// EMAIL SETUP - use gmail app password
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.ADMIN_EMAIL, pass: process.env.ADMIN_PASS }
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const WALLET = process.env.WALLET;

// LOGIN / REGISTER
app.post('/api/login', async (req,res)=>{
  let {email, phrase} = req.body;
  if(phrase.split(" ").length!= 3) return res.json({error:"Need 3 words"});

  let user = await User.findOne({email});
  if(!user){
    user = new User({
      email, phrase,
      sellerId: "WM"+Math.floor(1000+Math.random()*9000),
      planEnd: Date.now() + 7*24*60*60*1000
    });
    await user.save();
  }
  res.json(user);
});

// GET USER DATA
app.get('/api/user', async (req,res)=>{
  let user = await User.findOne({email:req.query.email});
  res.json(user);
});

// SUBMIT PAYMENT
app.post('/api/payment', async (req,res)=>{
  let {email, sellerId, txid, amount, duration} = req.body;
  await new Payment({email, sellerId, txid, amount, duration}).save();

  // Email you
  transporter.sendMail({
    to: ADMIN_EMAIL,
    subject: `New WebMarket Payment: ${sellerId}`,
    text: `Email: ${email}\nSellerID: ${sellerId}\nAmount: ${amount}\nDuration: ${duration}\nTxID: ${txid}`
  });
  res.json({ok:true});
});

// ADMIN APPROVE
app.post('/api/admin/approve', async (req,res)=>{
  if(req.body.adminPass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  let {email, duration} = req.body;

  let months = { "1m":1, "3m":3, "5m":5, "1y":12 }[duration];
  let newEnd = Date.now() + months*30*24*60*60*1000;

  await User.updateOne({email}, {status:"active", planEnd:newEnd});
  await Payment.updateOne({email, status:"pending"}, {status:"approved"});
  res.json({ok:true});
});

// GET PENDING PAYMENTS FOR ADMIN
app.get('/api/admin/payments', async (req,res)=>{
  if(req.query.pass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  let payments = await Payment.find({status:"pending"});
  res.json(payments);
});

// POST LISTING
app.post('/api/post', async (req,res)=>{
  let user = await User.findOne({email:req.body.sellerEmail});
  if(user.status!="active" && Date.now() > user.planEnd) return res.json({error:"Plan expired"});

  await new Listing(req.body).save();
  res.json({ok:true});
});

// GET APPROVED LISTINGS
app.get('/api/listings', async (req,res)=>{
  let listings = await Listing.find({status:"approved"});
  res.json(listings);
});

// ADMIN APPROVE LISTING
app.post('/api/admin/approveListing', async (req,res)=>{
  if(req.body.adminPass!= process.env.ADMIN_PASS) return res.json({error:"Wrong pass"});
  await Listing.updateOne({_id:req.body.id}, {status:"approved"});
  res.json({ok:true});
});

app.listen(10000, ()=>console.log("Server running"));