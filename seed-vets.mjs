import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: '/Users/isoft/Desktop/projects/vepaw-backend/.env' });

const BASE = 'http://localhost:3001/api/v1';

const VETS = [
  {
    fullName: 'Dr. Sara Ahmed',
    email: 'sara.ahmed@vepawvet.pk',
    phone: '03001110001',
    clinicName: 'Sara Pet Clinic',
    city: 'Lahore',
    area: 'DHA Phase 5',
    fullAddress: 'House 12, Street 4, DHA Phase 5, Lahore',
    specialisations: ['General Practice', 'Preventive Care'],
    feeMin: '500',
    feeMax: '1500',
    languages: ['en', 'ur'],
    pvmcNumber: 'PVMC-2024-001',
    yearsOfExperience: '5',
    primaryQualification: 'DVM',
    university: 'University of Veterinary and Animal Sciences',
    payoutMethod: 'JazzCash',
    accountTitle: 'Sara Ahmed',
    mobileAccount: '03001110001',
    cnicOnAccount: '3520112345671',
  },
  {
    fullName: 'Dr. Bilal Khan',
    email: 'bilal.khan@vepawvet.pk',
    phone: '03001110002',
    clinicName: 'Khan Animal Hospital',
    city: 'Lahore',
    area: 'Gulberg III',
    fullAddress: 'Office 5, Commercial Area, Gulberg III, Lahore',
    specialisations: ['Surgery', 'Orthopedics'],
    feeMin: '800',
    feeMax: '2500',
    languages: ['en', 'ur'],
    pvmcNumber: 'PVMC-2024-002',
    yearsOfExperience: '8',
    primaryQualification: 'DVM, MS Surgery',
    university: 'Arid Agriculture University',
    payoutMethod: 'Easypaisa',
    accountTitle: 'Bilal Khan',
    mobileAccount: '03001110002',
    cnicOnAccount: '3520212345672',
  },
  {
    fullName: 'Dr. Ayesha Malik',
    email: 'ayesha.malik@vepawvet.pk',
    phone: '03001110003',
    clinicName: 'Malik Exotic Vets',
    city: 'Lahore',
    area: 'Model Town',
    fullAddress: 'Block C, Model Town, Lahore',
    specialisations: ['Exotic Animals', 'Avian Medicine'],
    feeMin: '700',
    feeMax: '2000',
    languages: ['en'],
    pvmcNumber: 'PVMC-2024-003',
    yearsOfExperience: '6',
    primaryQualification: 'DVM',
    university: 'University of Veterinary and Animal Sciences',
    payoutMethod: 'JazzCash',
    accountTitle: 'Ayesha Malik',
    mobileAccount: '03001110003',
    cnicOnAccount: '3520312345673',
  },
  {
    fullName: 'Dr. Usman Raza',
    email: 'usman.raza@vepawvet.pk',
    phone: '03001110004',
    clinicName: 'Raza Dental & Vet',
    city: 'Lahore',
    area: 'Johar Town',
    fullAddress: '45-B, Johar Town, Lahore',
    specialisations: ['Dentistry', 'Oral Surgery'],
    feeMin: '600',
    feeMax: '1800',
    languages: ['en', 'ur'],
    pvmcNumber: 'PVMC-2024-004',
    yearsOfExperience: '4',
    primaryQualification: 'DVM, Dip. Veterinary Dentistry',
    university: 'Arid Agriculture University',
    payoutMethod: 'JazzCash',
    accountTitle: 'Usman Raza',
    mobileAccount: '03001110004',
    cnicOnAccount: '3520412345674',
  },
  {
    fullName: 'Dr. Hira Baig',
    email: 'hira.baig@vepawvet.pk',
    phone: '03001110005',
    clinicName: 'Baig Internal Medicine Clinic',
    city: 'Lahore',
    area: 'Bahria Town',
    fullAddress: 'Sector C, Bahria Town, Lahore',
    specialisations: ['Internal Medicine', 'Cardiology'],
    feeMin: '900',
    feeMax: '3000',
    languages: ['en'],
    pvmcNumber: 'PVMC-2024-005',
    yearsOfExperience: '10',
    primaryQualification: 'DVM, PhD Internal Medicine',
    university: 'University of Agriculture Faisalabad',
    payoutMethod: 'Easypaisa',
    accountTitle: 'Hira Baig',
    mobileAccount: '03001110005',
    cnicOnAccount: '3520512345675',
  },
  {
    fullName: 'Dr. Zain Qureshi',
    email: 'zain.qureshi@vepawvet.pk',
    phone: '03001110006',
    clinicName: 'Qureshi Derma Vet',
    city: 'Lahore',
    area: 'Garden Town',
    fullAddress: '22, Jail Road, Garden Town, Lahore',
    specialisations: ['Dermatology', 'Allergy & Immunology'],
    feeMin: '750',
    feeMax: '2200',
    languages: ['en', 'ur'],
    pvmcNumber: 'PVMC-2024-006',
    yearsOfExperience: '7',
    primaryQualification: 'DVM, Cert. Dermatology',
    university: 'University of Veterinary and Animal Sciences',
    payoutMethod: 'JazzCash',
    accountTitle: 'Zain Qureshi',
    mobileAccount: '03001110006',
    cnicOnAccount: '3520612345676',
  },
];

// Password derived from email: capitalize first name + "@Vet2024"
function passwordFromEmail(email) {
  const username = email.split('@')[0];        // sara.ahmed
  const first = username.split('.')[0];         // sara
  return first.charAt(0).toUpperCase() + first.slice(1) + '@Vet2024'; // Sara@Vet2024
}

async function post(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}

async function get(url, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, { headers });
  return res.json();
}

// ── Step 1: Submit vet applications ──────────────────────────────────────────
console.log('\n═══ STEP 1: Submitting vet applications ═══\n');
for (const vet of VETS) {
  const res = await post('/vet/onboarding/submit', vet);
  const ok = res.success !== false;
  console.log(`  ${ok ? '✓' : '✗'} ${vet.fullName} (${vet.email}) — ${res.message ?? JSON.stringify(res)}`);
}

// ── Step 2: Admin login ───────────────────────────────────────────────────────
console.log('\n═══ STEP 2: Admin login ═══\n');
const loginRes = await post('/admin/auth/login', { email: 'admin@vepaw.pk', password: 'admin123' });
if (!loginRes.data?.token) {
  console.error('Admin login failed:', JSON.stringify(loginRes));
  process.exit(1);
}
const adminToken = loginRes.data.token;
console.log(`  ✓ Logged in as ${loginRes.data.name}`);

// ── Step 3: Get pending applications ─────────────────────────────────────────
console.log('\n═══ STEP 3: Fetching vet applications ═══\n');
const appsRes = await get('/admin/vet-applications', adminToken);
const pending = (appsRes.data ?? []).filter(a => a.status === 'pending');
console.log(`  Found ${pending.length} pending application(s)`);

// ── Step 4: Approve each application ─────────────────────────────────────────
console.log('\n═══ STEP 4: Approving applications ═══\n');
for (const app of pending) {
  const res = await post(`/admin/vet-applications/${app.id}/status`, { status: 'approved' }, adminToken);
  const ok = res.success !== false;
  console.log(`  ${ok ? '✓' : '✗'} ${app.name ?? app.id} — ${res.message ?? JSON.stringify(res)}`);
}

// ── Step 5: Fetch tokens from DB and set passwords ────────────────────────────
// Use known emails from VETS array directly (admin list API omits email field)
console.log('\n═══ STEP 5: Setting passwords ═══\n');
const vetEmails = VETS.map(v => v.email);

await mongoose.connect(process.env.MONGODB_URI);
const tokenDocs = await mongoose.connection.db
  .collection('passwordtokens')
  .find({ email: { $in: vetEmails }, used: false })
  .sort({ createdAt: -1 })
  .toArray();
await mongoose.disconnect();

// Keep only the latest token per email
const latestByEmail = new Map();
for (const doc of tokenDocs) {
  if (!latestByEmail.has(doc.email)) latestByEmail.set(doc.email, doc.token);
}

let setCount = 0;
for (const [email, token] of latestByEmail.entries()) {
  const password = passwordFromEmail(email);
  const res = await post('/auth/set-password', { token, password });
  const ok = res.success !== false;
  if (ok) setCount++;
  console.log(`  ${ok ? '✓' : '✗'} ${email}  →  password: ${password}  —  ${res.message ?? JSON.stringify(res)}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n═══ SUMMARY ═══\n');
console.log(`  Applications submitted : ${VETS.length}`);
console.log(`  Approved               : ${VETS.length}`);
console.log(`  Passwords set          : ${setCount}`);
console.log('\n  Credentials:\n');
for (const vet of VETS) {
  console.log(`  ${vet.fullName.padEnd(22)} ${vet.email.padEnd(30)} ${passwordFromEmail(vet.email)}`);
}
console.log();
