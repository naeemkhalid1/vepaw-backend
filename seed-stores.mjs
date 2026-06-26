import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/isoft/Desktop/projects/vepaw-backend/.env' });

const BASE = 'http://localhost:3001/api/v1';

// ── 6 Stores ──────────────────────────────────────────────────────────────────
const STORES = [
  {
    storeName: 'PawMart',
    ownerName: 'Ahmad Siddiqui',
    phone: '03111220001',
    storeAddress: 'Shop 14, Packages Mall Road, Lahore',
    ntn: 'NTN-2024-001',
    ownerCnic: '3520111111101',
    payoutMethod: 'JazzCash',
    merchantAccount: '03111220001',
  },
  {
    storeName: 'VetRx Pharmacy',
    ownerName: 'Nadia Farooq',
    phone: '03111220002',
    storeAddress: 'Plot 7, Cavalry Ground, Lahore',
    ntn: 'NTN-2024-002',
    ownerCnic: '3520111111202',
    payoutMethod: 'Easypaisa',
    merchantAccount: '03111220002',
  },
  {
    storeName: 'Grooming Luxe',
    ownerName: 'Tariq Mehmood',
    phone: '03111220003',
    storeAddress: '23-B, Main Boulevard Gulberg, Lahore',
    ntn: 'NTN-2024-003',
    ownerCnic: '3520111111303',
    payoutMethod: 'JazzCash',
    merchantAccount: '03111220003',
  },
  {
    storeName: 'FoodFirst Pets',
    ownerName: 'Sana Ijaz',
    phone: '03111220004',
    storeAddress: 'Block H, DHA Phase 6, Lahore',
    ntn: 'NTN-2024-004',
    ownerCnic: '3520111111404',
    payoutMethod: 'JazzCash',
    merchantAccount: '03111220004',
  },
  {
    storeName: 'Pets & More',
    ownerName: 'Kamran Ali',
    phone: '03111220005',
    storeAddress: '45, Johar Town Main Market, Lahore',
    ntn: 'NTN-2024-005',
    ownerCnic: '3520111111505',
    payoutMethod: 'Easypaisa',
    merchantAccount: '03111220005',
  },
  {
    storeName: 'PurePet Store',
    ownerName: 'Mariam Khan',
    phone: '03111220006',
    storeAddress: 'Shop 3, Bahria Town Commercial Zone, Lahore',
    ntn: 'NTN-2024-006',
    ownerCnic: '3520111111606',
    payoutMethod: 'JazzCash',
    merchantAccount: '03111220006',
  },
];

// Password: first word of ownerName capitalized + "@Store2024"
function passwordFor(store) {
  const first = store.ownerName.split(' ')[0];
  return first.charAt(0).toUpperCase() + first.slice(1) + '@Store2024';
}

// ── 50 Products per store (10 per category) ───────────────────────────────────
// Categories: food | medicine | accessories | grooming | treats
const PRODUCT_TEMPLATES = {
  food: [
    { name: 'Royal Canin Adult Dog Food 3kg',        price: 3500, stock: 80,  rx: false },
    { name: 'Whiskas Tuna Cat Food 400g',             price: 480,  stock: 150, rx: false },
    { name: 'Pedigree Puppy Chicken & Milk 1kg',      price: 950,  stock: 100, rx: false },
    { name: 'Pro Plan Sensitive Skin Salmon 2kg',     price: 4200, stock: 60,  rx: false },
    { name: 'Hills Science Diet Adult Indoor Cat',    price: 3800, stock: 55,  rx: false },
    { name: 'Orijen Original Dog Food 2kg',           price: 5500, stock: 40,  rx: false },
    { name: 'Acana Free-Run Poultry Cat 1.8kg',       price: 4800, stock: 35,  rx: false },
    { name: 'Eukanuba Small Breed Adult 2kg',         price: 3200, stock: 70,  rx: false },
    { name: 'Farmina N&D Grain Free Duck 800g',       price: 2900, stock: 45,  rx: false },
    { name: 'Taste of the Wild Pacific Stream 2kg',   price: 3700, stock: 50,  rx: false },
  ],
  medicine: [
    { name: 'Heartgard Plus Chewables 6 Pack',       price: 2800, stock: 60,  rx: true,  batch: 'BT-HG-2024' },
    { name: 'Frontline Plus Flea & Tick Spot-On',    price: 1800, stock: 90,  rx: false, batch: 'BT-FL-2024' },
    { name: 'Drontal Allwormer Dog 4 Tabs',          price: 1200, stock: 120, rx: true,  batch: 'BT-DR-2024' },
    { name: 'Advocate Spot-On Cat 0.4ml x3',         price: 2200, stock: 75,  rx: false, batch: 'BT-AV-2024' },
    { name: 'Nexgard Spectra Chewable Tablet',       price: 3100, stock: 50,  rx: true,  batch: 'BT-NX-2024' },
    { name: 'Milbemax Dewormer Cat 2 Tabs',          price: 950,  stock: 100, rx: true,  batch: 'BT-MB-2024' },
    { name: 'Bravecto Spot-On Dog 500mg',            price: 4500, stock: 40,  rx: true,  batch: 'BT-BV-2024' },
    { name: 'Seresto Flea & Tick Collar Dog',        price: 5200, stock: 30,  rx: false, batch: 'BT-SR-2024' },
    { name: 'Panacur C Canine Dewormer 3 Pack',      price: 1400, stock: 80,  rx: true,  batch: 'BT-PC-2024' },
    { name: 'Revolution Plus Cat Flea Treatment',    price: 2600, stock: 55,  rx: true,  batch: 'BT-RP-2024' },
  ],
  accessories: [
    { name: 'Adjustable Nylon Dog Harness Medium',   price: 1200, stock: 60,  rx: false },
    { name: 'Retractable Dog Leash 5m',              price: 900,  stock: 80,  rx: false },
    { name: 'Stainless Steel Auto Water Bowl',       price: 750,  stock: 100, rx: false },
    { name: 'Orthopedic Memory Foam Dog Bed Large',  price: 4500, stock: 25,  rx: false },
    { name: 'Cat Tree Condo with Scratching Post',   price: 5800, stock: 20,  rx: false },
    { name: 'Portable Pet Carrier Bag Medium',       price: 2800, stock: 35,  rx: false },
    { name: 'Interactive Puzzle Feeder Dog Toy',     price: 1500, stock: 55,  rx: false },
    { name: 'Cat Laser Pointer Toy Set',             price: 600,  stock: 90,  rx: false },
    { name: 'Reflective LED Dog Collar Adjustable',  price: 850,  stock: 70,  rx: false },
    { name: 'Dog Car Seat Belt Safety Clip',         price: 550,  stock: 110, rx: false },
  ],
  grooming: [
    { name: 'FURminator deShedding Tool Dog Large',  price: 3200, stock: 40,  rx: false },
    { name: 'Vet\'s Best Hypoallergenic Shampoo',    price: 1100, stock: 75,  rx: false },
    { name: 'Pet Nail Grinder Rechargeable',         price: 2500, stock: 45,  rx: false },
    { name: 'Safari Self-Cleaning Slicker Brush',    price: 1400, stock: 60,  rx: false },
    { name: 'Burt\'s Bees Hypoallergenic Dog Spray', price: 900,  stock: 80,  rx: false },
    { name: 'Andis Clipper Blade Replacement Set',   price: 1800, stock: 35,  rx: false },
    { name: 'Espree Aloe Vera Oatmeal Shampoo 1L',   price: 1600, stock: 55,  rx: false },
    { name: 'Dog Teeth Cleaning Gel Mint 100g',      price: 750,  stock: 95,  rx: false },
    { name: 'Kong ZoomGroom Rubber Brush Cat',       price: 700,  stock: 85,  rx: false },
    { name: 'Waterless Dry Shampoo Mousse Cat',      price: 850,  stock: 70,  rx: false },
  ],
  treats: [
    { name: 'Zuke\'s Mini Naturals Chicken Dog 170g', price: 850,  stock: 120, rx: false },
    { name: 'Greenies Dental Chews Regular 170g',    price: 1200, stock: 100, rx: false },
    { name: 'Blue Buffalo Wilderness Trail Treats',  price: 950,  stock: 90,  rx: false },
    { name: 'Temptations Classic Cat Treats 85g',    price: 550,  stock: 140, rx: false },
    { name: 'Milk-Bone Original Dog Biscuits 450g',  price: 700,  stock: 110, rx: false },
    { name: 'Natural Balance Rewards Chicken 170g',  price: 900,  stock: 95,  rx: false },
    { name: 'Wellness Soft WellBites Dog Treats',    price: 1100, stock: 80,  rx: false },
    { name: 'PureBites Freeze Dried Beef Liver',     price: 1500, stock: 65,  rx: false },
    { name: 'Friskies Party Mix Cat Treats 60g',     price: 480,  stock: 130, rx: false },
    { name: 'VetIQ Hip & Joint Dog Chews 30 Pack',   price: 2200, stock: 50,  rx: false },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────────
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

// ── Step 1: Register stores ────────────────────────────────────────────────────
console.log('\n═══ STEP 1: Registering stores ═══\n');
for (const store of STORES) {
  const res = await post('/store/register', store);
  const ok = res.success !== false;
  console.log(`  ${ok ? '✓' : '✗'} ${store.storeName} (${store.ownerName}) — ${res.message ?? JSON.stringify(res)}`);
}

// ── Step 2: Admin login ────────────────────────────────────────────────────────
console.log('\n═══ STEP 2: Admin login ═══\n');
const loginRes = await post('/admin/auth/login', { email: 'admin@vepaw.pk', password: 'admin123' });
if (!loginRes.data?.token) { console.error('Admin login failed:', JSON.stringify(loginRes)); process.exit(1); }
const adminToken = loginRes.data.token;
console.log(`  ✓ Logged in as ${loginRes.data.name}`);

// ── Step 3: Fetch pending store applications ───────────────────────────────────
console.log('\n═══ STEP 3: Fetching store applications ═══\n');
const appsRes = await get('/admin/store-applications', adminToken);
const pending = (appsRes.data ?? []).filter(a => a.status === 'pending');
console.log(`  Found ${pending.length} pending application(s)`);

// ── Step 4: Approve each store ────────────────────────────────────────────────
console.log('\n═══ STEP 4: Approving stores ═══\n');
const approvedPhones = [];
for (const app of pending) {
  const res = await post(`/admin/store-applications/${app.id}/status`, { status: 'approved' }, adminToken);
  const ok = res.success !== false;
  // admin list API returns phone
  if (ok && app.phone) approvedPhones.push(app.phone);
  console.log(`  ${ok ? '✓' : '✗'} ${app.storeName} (${app.phone}) — ${res.message ?? JSON.stringify(res)}`);
}

// ── Step 5: Fetch password tokens and set passwords ───────────────────────────
console.log('\n═══ STEP 5: Setting passwords ═══\n');
// For stores: generateSetPasswordToken uses store.email ?? store.phone as the token's `email` field
const storePhones = STORES.map(s => s.phone);

await mongoose.connect(process.env.MONGODB_URI);
const tokenDocs = await mongoose.connection.db
  .collection('passwordtokens')
  .find({ email: { $in: storePhones }, entityType: 'store', used: false })
  .sort({ createdAt: -1 })
  .toArray();
await mongoose.disconnect();

// Latest unused token per phone
const latestByPhone = new Map();
for (const doc of tokenDocs) {
  if (!latestByPhone.has(doc.email)) latestByPhone.set(doc.email, doc.token);
}

const storeJwts = {};   // phone → JWT token for product creation
let passwordsSet = 0;
for (const store of STORES) {
  const token = latestByPhone.get(store.phone);
  if (!token) { console.log(`  ✗ ${store.storeName} — no password token found`); continue; }
  const password = passwordFor(store);
  const res = await post('/auth/set-password', { token, password });
  const ok = res.success !== false;
  if (ok) passwordsSet++;
  console.log(`  ${ok ? '✓' : '✗'} ${store.storeName} → password: ${password} — ${res.message ?? JSON.stringify(res)}`);
}

// ── Step 6: Login as each store and collect JWTs ──────────────────────────────
console.log('\n═══ STEP 6: Store logins ═══\n');
for (const store of STORES) {
  const password = passwordFor(store);
  const res = await post('/auth/login', { emailOrPhone: store.phone, password });
  if (res.data?.token) {
    storeJwts[store.phone] = res.data.token;
    console.log(`  ✓ ${store.storeName} — logged in`);
  } else {
    console.log(`  ✗ ${store.storeName} — login failed: ${JSON.stringify(res)}`);
  }
}

// ── Step 7: Create 50 products per store ──────────────────────────────────────
console.log('\n═══ STEP 7: Creating products ═══\n');
const CATEGORIES = ['food', 'medicine', 'accessories', 'grooming', 'treats'];
let totalProducts = 0;

for (const store of STORES) {
  const jwt = storeJwts[store.phone];
  if (!jwt) { console.log(`  ✗ ${store.storeName} — skipping (no JWT)`); continue; }

  let storeCount = 0;
  for (const category of CATEGORIES) {
    const items = PRODUCT_TEMPLATES[category];
    for (const item of items) {
      const dto = {
        productName: item.name,
        category,
        description: `Premium ${category} product for your pet. ${item.name} — trusted by vets and pet owners across Lahore.`,
        requiresPrescription: item.rx,
        price: String(item.price),
        stockQuantity: String(item.stock),
        ...(item.batch ? { batchNumber: item.batch } : {}),
        sku: `${store.storeName.replace(/\s+/g, '').toUpperCase().slice(0, 3)}-${category.toUpperCase().slice(0, 3)}-${String(item.price)}`,
      };
      const res = await post('/store/products', dto, jwt);
      if (res.success !== false) storeCount++;
    }
  }

  totalProducts += storeCount;
  console.log(`  ✓ ${store.storeName} — ${storeCount}/50 products created`);
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n═══ SUMMARY ═══\n');
console.log(`  Stores registered  : ${STORES.length}`);
console.log(`  Passwords set      : ${passwordsSet}`);
console.log(`  Products created   : ${totalProducts} (${STORES.length} stores × 50)`);
console.log('\n  Store credentials:\n');
for (const store of STORES) {
  console.log(`  ${store.storeName.padEnd(18)} ${store.phone}  ${passwordFor(store)}`);
}
console.log();
