import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

// One-time fix for vets approved before the pin-drop picker shipped — they're all still sitting
// on the schema's old hardcoded default (Lahore center), which made /vets/nearby and
// /vets/emergency meaningless (every vet reporting the same distance). This geocodes each
// affected vet's existing address text via Nominatim (free, no API key/billing — see
// ARCHETECTURE.md for why: no budget for Google Maps Geocoding). Any vet this can't confidently
// place stays on the default and is listed at the end for the vet to fix themselves via the
// clinic-settings pin-drop screen (already shipped) — this script never guesses when unsure.
//
// Grouped by clinic (mirrors backfill-clinic-identity.ts): one geocode call per clinic, not per
// staff member, then the result is applied to every staff Vet in that clinic — cheaper, and
// avoids Nominatim returning slightly different coordinates for two calls with the same address.
//
// Dry run by default. Pass --apply to actually write.

const OLD_DEFAULT_COORDINATES = [74.3436, 31.5204];
const NOMINATIM_USER_AGENT = 'VePaw-Backend-Backfill/1.0 (ops@vepaw.pk)'; // replace with a real contact before running in prod
const NOMINATIM_DELAY_MS = 1100; // stays under Nominatim's 1 req/sec usage-policy ceiling

interface GeocodeResult {
  lat: number;
  lng: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocode(
  address: string,
  area: string,
  city: string,
): Promise<GeocodeResult | null> {
  const query = [address, area, city, 'Pakistan'].filter(Boolean).join(', ');
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pk&q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    });
    if (!res.ok) {
      console.warn(`    Nominatim HTTP ${res.status} for "${query}"`);
      return null;
    }
    const results = (await res.json()) as { lat: string; lon: string }[];
    if (results.length === 0) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch (err) {
    console.warn(
      `    Nominatim request failed for "${query}": ${(err as Error).message}`,
    );
    return null;
  }
}

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

  const stale = await vets
    .find({ 'location.coordinates': OLD_DEFAULT_COORDINATES })
    .project({
      name: 1,
      clinicId: 1,
      address: 1,
      area: 1,
      city: 1,
      staffRole: 1,
    })
    .toArray();

  console.log(
    `Found ${stale.length} vet(s) still on the old fake default location.\n`,
  );

  // Group into clinics (share one geocode call + result) and solo vets (no clinicId).
  const clinicGroups = new Map<string, typeof stale>();
  const soloVets: typeof stale = [];
  for (const v of stale) {
    if (v.clinicId) {
      const key = v.clinicId.toString();
      if (!clinicGroups.has(key)) clinicGroups.set(key, []);
      clinicGroups.get(key)!.push(v);
    } else {
      soloVets.push(v);
    }
  }

  let geocoded = 0;
  let vetsUpdated = 0;
  const failures: string[] = [];

  for (const [clinicId, group] of clinicGroups) {
    // Any member's address represents the clinic — they were all on the same default anyway.
    const rep = group[0];
    console.log(
      `Clinic ${clinicId} (${group.length} staff) — "${rep.address}, ${rep.area}, ${rep.city}"`,
    );
    const result = await geocode(rep.address, rep.area, rep.city);
    await sleep(NOMINATIM_DELAY_MS);

    if (!result) {
      console.log(
        '  ✗ Could not geocode — leaving at default, needs manual pin via clinic-settings',
      );
      failures.push(
        `clinic ${clinicId}: ${group.map((v) => v.name).join(', ')}`,
      );
      continue;
    }

    geocoded++;
    console.log(
      `  ${apply ? 'Updating' : 'Would update'} -> [${result.lng}, ${result.lat}] (${group.length} vet(s))`,
    );
    if (apply) {
      const write = await vets.updateMany(
        { _id: { $in: group.map((v) => v._id) } },
        {
          $set: {
            location: { type: 'Point', coordinates: [result.lng, result.lat] },
          },
        },
      );
      vetsUpdated += write.modifiedCount;
    } else {
      vetsUpdated += group.length;
    }
  }

  for (const v of soloVets) {
    console.log(`Solo vet ${v.name} — "${v.address}, ${v.area}, ${v.city}"`);
    const result = await geocode(v.address, v.area, v.city);
    await sleep(NOMINATIM_DELAY_MS);

    if (!result) {
      console.log(
        '  ✗ Could not geocode — leaving at default, needs manual pin via clinic-settings',
      );
      failures.push(`solo vet ${v._id.toString()}: ${v.name}`);
      continue;
    }

    geocoded++;
    console.log(
      `  ${apply ? 'Updating' : 'Would update'} -> [${result.lng}, ${result.lat}]`,
    );
    if (apply) {
      await vets.updateOne(
        { _id: v._id },
        {
          $set: {
            location: { type: 'Point', coordinates: [result.lng, result.lat] },
          },
        },
      );
    }
    vetsUpdated++;
  }

  const verb = apply ? 'Applied' : 'Dry run — would apply';
  const suffix = apply ? '' : ' (add --apply to write)';
  console.log(
    `\n${verb}: ${geocoded} location(s) geocoded, ${vetsUpdated} vet(s) updated${suffix}.`,
  );
  if (failures.length > 0) {
    console.log(
      `\n${failures.length} could not be geocoded automatically — needs a manual pin via clinic-settings:`,
    );
    failures.forEach((f) => console.log(`  - ${f}`));
  }

  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
