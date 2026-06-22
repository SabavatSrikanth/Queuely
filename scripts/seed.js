/**
 * Seed script — creates demo data for development/testing.
 * Run: npm run seed
 * WARNING: Drops existing seed data with matching emails before inserting.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Business = require('../models/Business');
const Branch = require('../models/Branch');
const Service = require('../models/Service');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clean up previous seed data
  await User.deleteMany({ email: { $in: ['admin@queuely.com', 'owner@queuely.com', 'customer@queuely.com'] } });


  const admin = await User.create({
    name: 'Super Admin',
    email: 'admin@queuely.com',
    password: 'Password123!',
    role: 'super_admin',
    isActive: true,
    isEmailVerified: true,
  });
  console.log('Created super_admin: admin@queuely.com / Password123!');

  const owner = await User.create({
    name: 'Demo Owner',
    email: 'owner@queuely.com',
    password: 'Password123!',
    role: 'business_owner',
    isActive: true,
    isEmailVerified: true,
  });

  const customer = await User.create({
    name: 'Demo Customer',
    email: 'customer@queuely.com',
    password: 'Password123!',
    role: 'customer',
    isActive: true,
    isEmailVerified: true,
  });
  console.log('Created customer: customer@queuely.com / Password123!');

 await Business.deleteMany({ slug: 'demo-health-clinic' });

const business = await Business.create({
    name: 'Demo Health Clinic',
    slug: 'demo-health-clinic',
    description: 'A demo healthcare clinic for testing Queuely.',
    category: 'healthcare',
    owner: owner._id,
    isVerified: true,
    isActive: true,
    address: { street: '123 Main St', city: 'Demo City', state: 'Demo State', country: 'India' },
    contact: { phone: '+1234567890', email: 'clinic@demo.com' },
  });
  owner.businessId = business._id;
  await owner.save();
  console.log('Created business: Demo Health Clinic');

  await Branch.deleteMany({ business: business._id });

  const branch = await Branch.create({
    business: business._id,
    name: 'Main Branch',
    isHeadquarters: true,
    address: { street: '123 Main St', city: 'Demo City', country: 'US' },
    contact: { phone: '+1234567890', email: 'main@demo.com' },
    operatingHours: [
      { day: 'mon', open: '09:00', close: '17:00', isClosed: false },
      { day: 'tue', open: '09:00', close: '17:00', isClosed: false },
      { day: 'wed', open: '09:00', close: '17:00', isClosed: false },
      { day: 'thu', open: '09:00', close: '17:00', isClosed: false },
      { day: 'fri', open: '09:00', close: '17:00', isClosed: false },
      { day: 'sat', open: '10:00', close: '14:00', isClosed: false },
      { day: 'sun', open: '00:00', close: '00:00', isClosed: true },
    ],
    isActive: true,
    isOpen: true,
  });
  console.log('Created branch: Main Branch');

  await Service.deleteMany({ business: business._id });

  await Service.create({
    business: business._id,
    branch: branch._id,
    name: 'General Consultation',
    description: 'Walk-in general medical consultation.',
    code: 'GEN',
    walkinEnabled: true,
    appointmentEnabled: true,
    isAcceptingQueue: true,
    estimatedServiceTime: 15,
    slotDuration: 20,
    bufferTime: 5,
    maxQueueCapacity: 50,
    maxAppointmentsPerSlot: 2,
    isActive: true,
  });

  await Service.create({
    business: business._id,
    branch: branch._id,
    name: 'Lab Tests',
    description: 'Walk-in blood and diagnostic lab tests.',
    code: 'LAB',
    walkinEnabled: true,
    appointmentEnabled: false,
    isAcceptingQueue: true,
    estimatedServiceTime: 10,
    slotDuration: 15,
    bufferTime: 0,
    maxQueueCapacity: 30,
    isActive: true,
  });

  console.log('Created 2 services: General Consultation, Lab Tests');
  console.log('\nSeed complete. Login credentials:');
  console.log('  admin@queuely.com     / Password123!  (super_admin)');
  console.log('  owner@queuely.com     / Password123!  (business_owner)');
  console.log('  customer@queuely.com  / Password123!  (customer)');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
