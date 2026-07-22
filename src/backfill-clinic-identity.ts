import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

// One-time reconciliation: before items 3/4 (admin_vet-gated + cascade-on-write), any staff
// member could independently edit clinicName/phone/address/city/area on their own Vet document,
// so existing multi-staff clinics may have already-diverged values. This brings every clinic-mate
// back in line with their clinic's admin_vet — the same values the cascade will now keep in sync
// going forward. Read-only dry run by default; pass --apply to actually write.
async function backfill(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db!;
  const vets = db.collection('vets');

  const clinicIds: string[] = await vets.distinct('clinicId', { clinicId: { $ne: null } });

  let clinicsWithDrift = 0;
  let vetsAffected = 0;

  for (const clinicId of clinicIds) {
    const staff = await vets
      .find({ clinicId })
      .project({ name: 1, staffRole: 1, clinicName: 1, phone: 1, address: 1, city: 1, area: 1 })
      .toArray();

    const admin = staff.find((v) => v.staffRole === 'admin_vet');
    if (!admin) {
      console.warn(`  ! Clinic ${clinicId} has no admin_vet — skipping (${staff.length} staff)`);
      continue;
    }

    const canonical = {
      clinicName: admin.clinicName,
      phone: admin.phone,
      address: admin.address,
      city: admin.city,
      area: admin.area,
    };

    const drifted = staff.filter(
      (v) =>
        v._id.toString() !== admin._id.toString() &&
        (v.clinicName !== canonical.clinicName ||
          v.phone !== canonical.phone ||
          v.address !== canonical.address ||
          v.city !== canonical.city ||
          v.area !== canonical.area),
    );

    if (drifted.length === 0) continue;

    clinicsWithDrift++;
    console.log(`\nClinic ${clinicId} — admin_vet: ${admin.name}`);
    for (const v of drifted) {
      console.log(`  ${apply ? 'Updating' : 'Would update'} ${v.name} (${v.staffRole}):`);
      console.log(`    clinicName: ${v.clinicName} -> ${canonical.clinicName}`);
      console.log(`    phone:      ${v.phone} -> ${canonical.phone}`);
      console.log(`    address:    ${v.address} -> ${canonical.address}`);
      console.log(`    city:       ${v.city} -> ${canonical.city}`);
      console.log(`    area:       ${v.area} -> ${canonical.area}`);
    }

    if (apply) {
      const result = await vets.updateMany(
        { _id: { $in: drifted.map((v) => v._id) } },
        { $set: canonical },
      );
      vetsAffected += result.modifiedCount;
    } else {
      vetsAffected += drifted.length;
    }
  }

  const verb = apply ? 'Applied' : 'Dry run — would apply';
  const suffix = apply ? '' : ' (add --apply to write)';
  console.log(`\n${verb}: ${clinicsWithDrift} clinic(s) with drift, ${vetsAffected} vet(s)${suffix}.`);

  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
