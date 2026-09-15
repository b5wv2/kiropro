import fs from 'fs';
import path from 'path';

const jsonPath = path.join(__dirname, '../data/gamesdrop-topups.json');
const raw = fs.readFileSync(jsonPath, 'utf8');
const catalog = JSON.parse(raw);

const offers = Array.isArray(catalog) ? catalog : (catalog.offers || catalog.data || []);

const bloodStrikeOffers = offers.filter((o: any) => {
  const pName = (o.productName || '').toLowerCase();
  const oName = (o.offerName || '').toLowerCase();
  return pName.includes('blood') || oName.includes('blood');
});

console.log(`Total Blood Strike offers found in gamesdrop-topups.json: ${bloodStrikeOffers.length}`);

bloodStrikeOffers.forEach((o: any, idx: number) => {
  console.log(`--- [${idx + 1}] ---`);
  console.log(`offerId: ${o.offerId || o.id}`);
  console.log(`productName: ${o.productName}`);
  console.log(`offerName: ${o.offerName}`);
  console.log(`regionCode: ${o.regionCode}`);
  console.log(`regionName: ${o.regionName}`);
  console.log(`countryCompatibility: ${JSON.stringify(o.countryCompatibility)}`);
  console.log(`price: ${o.price}`);
  console.log(`priceBreakdown:`, o.priceBreakdown);
  console.log(`productOfferId: ${o.productOfferId}`);
  console.log(`category: ${o.category}`);
});
